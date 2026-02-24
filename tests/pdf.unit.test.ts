import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePDF } from '../lib/pdf';

test('generatePDF handles zero transactions without NaN average', () => {
  const doc = generatePDF({
    totalRevenue: 42,
    totalTransactions: 0,
    topItems: [],
    dateRange: 'This Week',
  });

  const output = doc.output();
  assert.ok(typeof output === 'string');
  assert.ok(output.includes('Average Transaction: $0.00'));
  assert.ok(output.includes('No sales items available for this period.'));
});

test('generatePDF keeps long item names without throwing', () => {
  const longName =
    'Ultra Premium Barrel Aged House Special Reserve Cocktail Signature Edition with Extended Naming';
  const doc = generatePDF({
    totalRevenue: 180,
    totalTransactions: 3,
    topItems: [{ name: longName, count: 3, revenue: 180 }],
    dateRange: 'Today',
  });

  const output = doc.output();
  assert.ok(typeof output === 'string');
  assert.ok(output.includes('Top Items by Revenue'));
  assert.ok(output.includes('Revenue: $180.00'));
  assert.ok(output.includes('Sold: 3'));
});

test('generatePDF paginates when top item list is large', () => {
  const topItems = Array.from({ length: 80 }, (_, index) => ({
    name: `Item ${index + 1}`,
    count: index + 1,
    revenue: (index + 1) * 10,
  }));

  const doc = generatePDF({
    totalRevenue: 32400,
    totalTransactions: 80,
    topItems,
    dateRange: 'This Month',
  });

  const output = doc.output();
  const totalPages = doc.getNumberOfPages();

  assert.ok(totalPages > 1);
  assert.ok(output.toLowerCase().includes('continued'));

  const pageMatches = output.match(/Page \d+ of \d+/g) ?? [];
  assert.equal(pageMatches.length, totalPages);
});
