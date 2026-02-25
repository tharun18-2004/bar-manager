import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { serverError } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json({
      success: true,
      data: {
        userId: auth.user.id,
        email: auth.user.email ?? null,
        role: auth.role,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}

