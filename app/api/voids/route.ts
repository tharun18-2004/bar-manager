import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';
import { writeAuditEvent } from '@/lib/audit-log';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { sale_id, staff_name, void_reason, voided_amount } = await req.json();
    const parsedSaleId = Number(sale_id);
    const parsedVoidedAmount = Number(voided_amount);

    if (!Number.isInteger(parsedSaleId) || parsedSaleId <= 0) {
      return badRequest('sale_id must be a positive integer');
    }
    if (!void_reason || typeof void_reason !== 'string' || void_reason.trim().length < 3) {
      return badRequest('void_reason must be at least 3 characters');
    }
    if (!Number.isFinite(parsedVoidedAmount) || parsedVoidedAmount <= 0) {
      return badRequest('voided_amount must be a positive number');
    }

    // Insert into void_logs
    const { error: logError } = await supabase
      .from('void_logs')
      .insert([
        {
          sale_id: parsedSaleId,
          staff_name: auth.user.email ?? staff_name ?? 'staff',
          void_reason: void_reason.trim(),
          voided_amount: parsedVoidedAmount,
        },
      ]);

    if (logError) throw logError;

    // Update sales to mark as voided
    const { data, error: updateError } = await supabase
      .from('sales')
      .update({ is_voided: true, void_reason: void_reason.trim() })
      .eq('id', parsedSaleId)
      .select();

    if (updateError) throw updateError;

    await writeAuditEvent({
      req,
      actorId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      actorRole: auth.role,
      action: 'void.create',
      resource: 'sales',
      resourceId: parsedSaleId,
      outcome: 'success',
      metadata: {
        reason: void_reason.trim(),
        voidedAmount: parsedVoidedAmount,
      },
      after: data?.[0] ?? null,
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return serverError(error, req);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const staff = searchParams.get('staff');

    let query = supabase.from('void_logs').select('*');

    if (staff) query = query.eq('staff_name', staff);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return serverError(error, req);
  }
}

