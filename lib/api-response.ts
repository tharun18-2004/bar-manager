import { NextRequest, NextResponse } from 'next/server';

export function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }
  }
  return String(error);
}

function getErrorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return 'UnknownError';
}

function getErrorStack(error: unknown): string | null {
  if (error instanceof Error && typeof error.stack === 'string') {
    return error.stack;
  }
  return null;
}

export function serverError(error: unknown, req?: NextRequest) {
  const message = getErrorMessage(error);
  const requestId = req?.headers.get('x-request-id') ?? crypto.randomUUID();
  const route = req?.nextUrl?.pathname ?? null;
  const method = req?.method ?? null;

  console.error(
    JSON.stringify({
      level: 'error',
      type: 'api_error',
      timestamp: new Date().toISOString(),
      requestId,
      route,
      method,
      error: {
        name: getErrorName(error),
        message: getErrorMessage(error),
        stack: getErrorStack(error),
      },
    })
  );

  return NextResponse.json(
    { success: false, error: message, requestId },
    { status: 500, headers: { 'x-request-id': requestId } }
  );
}

export type DateRange = 'today' | 'week' | 'month';

export function parseDateRange(value: string | null): DateRange | null {
  if (value === null || value === 'week') return 'week';
  if (value === 'today' || value === 'month') return value;
  return null;
}

export function rangeStartIso(range: DateRange): string {
  const fromDate = new Date();

  if (range === 'today') {
    fromDate.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    fromDate.setDate(fromDate.getDate() - 7);
    fromDate.setHours(0, 0, 0, 0);
  } else {
    fromDate.setDate(1);
    fromDate.setHours(0, 0, 0, 0);
  }

  return fromDate.toISOString();
}
