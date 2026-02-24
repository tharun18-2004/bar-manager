import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPdfButtonLabel,
  getPdfFilename,
  getPdfPeriodLabel,
  isPdfExportDisabled,
} from '../lib/report-pdf-controls';

test('getPdfPeriodLabel returns expected labels', () => {
  assert.equal(getPdfPeriodLabel('today'), 'Today');
  assert.equal(getPdfPeriodLabel('week'), 'This Week');
  assert.equal(getPdfPeriodLabel('month'), 'This Month');
});

test('getPdfFilename returns date-range specific filename', () => {
  assert.equal(getPdfFilename('today'), 'sales-report-today.pdf');
  assert.equal(getPdfFilename('week'), 'sales-report-week.pdf');
  assert.equal(getPdfFilename('month'), 'sales-report-month.pdf');
});

test('isPdfExportDisabled covers loading/exporting/no-data states', () => {
  assert.equal(
    isPdfExportDisabled({ loading: true, exporting: false, hasSalesData: true }),
    true
  );
  assert.equal(
    isPdfExportDisabled({ loading: false, exporting: true, hasSalesData: true }),
    true
  );
  assert.equal(
    isPdfExportDisabled({ loading: false, exporting: false, hasSalesData: false }),
    true
  );
  assert.equal(
    isPdfExportDisabled({ loading: false, exporting: false, hasSalesData: true }),
    false
  );
});

test('getPdfButtonLabel reflects exporting state', () => {
  assert.equal(getPdfButtonLabel(true), 'Generating...');
  assert.equal(getPdfButtonLabel(false), 'Download PDF');
});
