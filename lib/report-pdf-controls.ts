export type ReportDateRange = 'today' | 'week' | 'month';

export function getPdfPeriodLabel(range: ReportDateRange) {
  if (range === 'today') return 'Today';
  if (range === 'week') return 'This Week';
  return 'This Month';
}

export function getPdfFilename(range: ReportDateRange) {
  return `sales-report-${range}.pdf`;
}

export function isPdfExportDisabled(options: {
  loading: boolean;
  exporting: boolean;
  hasSalesData: boolean;
}) {
  const { loading, exporting, hasSalesData } = options;
  return loading || exporting || !hasSalesData;
}

export function getPdfButtonLabel(exporting: boolean) {
  return exporting ? 'Generating...' : 'Download PDF';
}
