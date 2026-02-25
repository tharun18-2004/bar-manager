import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { badRequest, serverError } from '@/lib/api-response';

type RazorpayOrderResponse = {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
};

const PAYMENT_METHODS = new Set(['CARD', 'UPI']);

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, ['staff', 'manager', 'owner']);
    if (auth instanceof NextResponse) return auth;

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay is not configured' },
        { status: 500 }
      );
    }

    const { amount, orderId, paymentMethod } = await req.json();
    const parsedAmount = Number(amount);
    const normalizedOrderId = typeof orderId === 'string' ? orderId.trim() : '';
    const normalizedMethod =
      typeof paymentMethod === 'string' ? paymentMethod.trim().toUpperCase() : '';

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return badRequest('amount must be a positive number');
    }
    if (!normalizedOrderId) {
      return badRequest('orderId is required');
    }
    if (!PAYMENT_METHODS.has(normalizedMethod)) {
      return badRequest('paymentMethod must be one of: CARD, UPI');
    }

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(parsedAmount * 100),
        currency: 'INR',
        receipt: normalizedOrderId.slice(0, 40),
      }),
    });

    const payload = (await response.json()) as RazorpayOrderResponse | { error?: { description?: string } };
    if (!response.ok || !('id' in payload)) {
      const message =
        'error' in payload && payload.error?.description
          ? payload.error.description
          : `Razorpay order creation failed (${response.status})`;
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: {
        razorpayOrderId: payload.id,
        amount: payload.amount,
        currency: payload.currency,
        keyId: razorpayKeyId,
      },
    });
  } catch (error) {
    return serverError(error, req);
  }
}
