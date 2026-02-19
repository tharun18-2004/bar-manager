import { NextResponse } from 'next/server';

export function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ success: false, error: message }, { status: 500 });
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
  } else {
    fromDate.setDate(fromDate.getDate() - 30);
  }

  return fromDate.toISOString();
}
