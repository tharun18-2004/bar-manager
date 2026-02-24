import { jsPDF } from 'jspdf';

interface ReportData {
  totalRevenue: number;
  totalTransactions: number;
  topItems: Array<{ name: string; count: number; revenue: number }>;
  dateRange: string;
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function generatePDF(data: ReportData) {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 10;
  const left = 20;
  const rightNameX = 120;
  const rightCountX = 170;
  const lineHeight = 6;
  const sectionGap = 10;
  const tableMaxWidth = 95;
  const pageWidth = doc.internal.pageSize.getWidth();

  const renderTopItemsHeader = (startY: number, continued: boolean) => {
    doc.setFontSize(12);
    doc.text(continued ? 'Top Items by Revenue (continued)' : 'Top Items by Revenue', left, startY);

    const columnsY = startY + 8;
    doc.setFontSize(9);
    doc.text('Item', left, columnsY);
    doc.text('Revenue', rightNameX, columnsY);
    doc.text('Sold', rightCountX, columnsY);
    doc.line(left, columnsY + 2, pageWidth - 20, columnsY + 2);

    doc.setFontSize(10);
    return columnsY + 8;
  };

  const renderFooterForAllPages = () => {
    const totalPages = doc.getNumberOfPages();

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);

    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.text(
        'This is an automatically generated report. Keep for your records.',
        left,
        footerY
      );
      doc.text(`Page ${page} of ${totalPages}`, pageWidth - 20, footerY, {
        align: 'right',
      });
    }

    doc.setTextColor(255, 255, 255);
  };

  const averageTransaction =
    data.totalTransactions > 0 ? data.totalRevenue / data.totalTransactions : 0;

  // Set base colors
  doc.setFillColor(30, 30, 30);
  doc.setDrawColor(59, 130, 246);
  doc.setTextColor(255, 255, 255);

  // Header
  doc.setFontSize(20);
  doc.text('BAR-LOGIC', left, 20);
  doc.setFontSize(12);
  doc.text('Sales Report', left, 30);
  doc.setFontSize(10);
  doc.text(`Period: ${data.dateRange}`, left, 40);
  doc.text(`Generated: ${new Date().toLocaleString()}`, left, 50);

  // Summary
  doc.setFontSize(12);
  doc.text('Summary', left, 65);
  doc.setFontSize(10);
  doc.text(`Total Revenue: ${formatCurrency(data.totalRevenue)}`, left, 75);
  doc.text(`Total Transactions: ${data.totalTransactions}`, left, 85);
  doc.text(`Average Transaction: ${formatCurrency(averageTransaction)}`, left, 95);

  // Top Items Table
  let yPosition = renderTopItemsHeader(110, false);

  if (data.topItems.length === 0) {
    doc.text('No sales items available for this period.', left, yPosition);
    yPosition += sectionGap;
  }

  data.topItems.forEach((item, index) => {
    const nameLines = doc.splitTextToSize(`${index + 1}. ${item.name}`, tableMaxWidth);
    const rowHeight = Math.max(nameLines.length * lineHeight, lineHeight);

    if (yPosition + rowHeight > footerY - sectionGap) {
      doc.addPage();
      yPosition = renderTopItemsHeader(20, true);
    }

    doc.text(nameLines, left, yPosition);
    doc.text(`Revenue: ${formatCurrency(item.revenue)}`, rightNameX, yPosition);
    doc.text(`Sold: ${item.count}`, rightCountX, yPosition);
    yPosition += rowHeight + 4;
  });

  renderFooterForAllPages();

  return doc;
}

export function downloadPDF(doc: jsPDF, filename: string = 'report.pdf') {
  doc.save(filename);
}
