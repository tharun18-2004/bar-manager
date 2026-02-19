import { jsPDF } from 'jspdf';

interface ReportData {
  totalRevenue: number;
  totalTransactions: number;
  topItems: Array<{ name: string; count: number; revenue: number }>;
  dateRange: string;
}

export function generatePDF(data: ReportData) {
  const doc = new jsPDF();
  
  // Set colors
  doc.setFillColor(30, 30, 30);
  doc.setDrawColor(59, 130, 246);
  doc.setTextColor(255, 255, 255);

  // Header
  doc.setFontSize(20);
  doc.text('BAR-LOGIC', 20, 20);
  doc.setFontSize(12);
  doc.text('Sales Report', 20, 30);
  doc.setFontSize(10);
  doc.text(`Period: ${data.dateRange}`, 20, 40);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 50);

  // Summary
  doc.setFontSize(12);
  doc.text('Summary', 20, 65);
  doc.setFontSize(10);
  doc.text(`Total Revenue: $${data.totalRevenue.toFixed(2)}`, 20, 75);
  doc.text(`Total Transactions: ${data.totalTransactions}`, 20, 85);
  doc.text(`Average Transaction: $${(data.totalRevenue / data.totalTransactions).toFixed(2)}`, 20, 95);

  // Top Items Table
  doc.setFontSize(12);
  doc.text('Top Items by Revenue', 20, 110);
  
  let yPosition = 120;
  doc.setFontSize(10);
  
  data.topItems.forEach((item, index) => {
    doc.text(`${index + 1}. ${item.name}`, 20, yPosition);
    doc.text(`Revenue: $${item.revenue.toFixed(2)}`, 120, yPosition);
    doc.text(`Sold: ${item.count}`, 170, yPosition);
    yPosition += 10;
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('This is an automatically generated report. Keep for your records.', 20, doc.internal.pageSize.height - 10);

  return doc;
}

export function downloadPDF(doc: jsPDF, filename: string = 'report.pdf') {
  doc.save(filename);
}
