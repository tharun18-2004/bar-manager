// Receipt generation utilities
export function generateReceipt(orderId: string, items: Array<{ name: string; quantity: number; price: number }>, total: number, staffName: string) {
  const timestamp = new Date().toLocaleString();
  const itemsList = items.map(item => `${item.name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)}`).join('\n');

  const receipt = `
════════════════════════════════════
            BAR-LOGIC
          RECEIPT
════════════════════════════════════

Order ID: ${orderId}
Staff: ${staffName}
Date: ${timestamp}

────────────────────────────────────
ITEMS:
${itemsList}

────────────────────────────────────
SUBTOTAL:              $${total.toFixed(2)}
Tax (10%):             $${(total * 0.1).toFixed(2)}
────────────────────────────────────
TOTAL:                 $${(total * 1.1).toFixed(2)}
════════════════════════════════════

Thank you for your business!
Please come again.

════════════════════════════════════
  `;

  return receipt;
}

export function downloadReceipt(receipt: string, orderId: string) {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(receipt));
  element.setAttribute('download', `receipt-${orderId}.txt`);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

export function printReceipt(receipt: string) {
  const printWindow = window.open('', '', 'height=600,width=800');
  printWindow?.document.write('<pre style="font-family: monospace; font-size: 12px;">' + receipt + '</pre>');
  printWindow?.document.close();
  printWindow?.print();
}
