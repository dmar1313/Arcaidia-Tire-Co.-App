import { jsPDF } from 'jspdf';
import type { CompanyProfile, WorkOrder } from '../types';
import { formatCurrency, formatTimestamp } from './calculations';

const SHOP_LOGO_URL = '/logo/wordmark.png';

let cachedLogoDataUrl: string | null = null;
let logoPreloadStarted = false;

export function preloadShopLogoForPdf(): void {
  if (typeof window === 'undefined' || logoPreloadStarted || cachedLogoDataUrl) return;
  logoPreloadStarted = true;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) return;
            // The wordmark asset is already the wide logo (958x443, 2.16:1) — draw
      // it whole, no crop. White canvas behind it (the asset is on white).
      const canvas = document.createElement('canvas');
      canvas.width = srcW;
            canvas.height = srcH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, srcW, srcH);
      ctx.drawImage(img, 0, 0, srcW, srcH);
      cachedLogoDataUrl = canvas.toDataURL('image/png');
    } catch {
      // Ignore canvas export errors in restricted contexts
    }
  };
  img.src = SHOP_LOGO_URL;
}

if (typeof window !== 'undefined') {
  preloadShopLogoForPdf();
}

export function buildReceiptPdfDoc(wo: WorkOrder, company: CompanyProfile | null): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const shopName = company?.shopName || 'Arcadia Tire Co.';
  const shopAddress = [company?.address, company?.cityStateZip].filter(Boolean).join(', ');
  const shopContact = [company?.phone, company?.email].filter(Boolean).join(' · ');

  // Header
  if (cachedLogoDataUrl) {
        // Wordmark is 958x443 (2.16:1) — draw at 114x53 to keep it undistorted.
    doc.addImage(cachedLogoDataUrl, 'PNG', margin, y - 16, 114, 53);
    y += 50;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text(shopName, margin, y);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const statusLabel =
    wo.status === 'paid'
      ? 'RECEIPT · PAID'
      : wo.status === 'voided'
      ? 'RECEIPT · VOIDED'
      : `WORK ORDER · ${wo.status.replace(/_/g, ' ').toUpperCase()}`;
  doc.setTextColor(wo.status === 'voided' ? 220 : 15, wo.status === 'voided' ? 38 : 23, wo.status === 'voided' ? 38 : 42);
  doc.text(statusLabel, pageWidth - margin, 48, { align: 'right' });

  y += cachedLogoDataUrl ? 4 : 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  if (cachedLogoDataUrl && company?.shopName && company.shopName.toLowerCase() !== 'arcadia tire co.') {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(shopName, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
  }
  if (shopAddress) {
    doc.text(shopAddress, margin, y);
    y += 14;
  }
  if (shopContact) {
    doc.text(shopContact, margin, y);
    y += 14;
  }

  // Work order metadata on right
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(wo.orderNumber, pageWidth - margin, 66, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const dateStr = wo.paidAt ? new Date(wo.paidAt).toLocaleString() : formatTimestamp(wo.createdAt);
  doc.text(dateStr, pageWidth - margin, 80, { align: 'right' });

  y = Math.max(y + 10, 108);
  doc.setDrawColor(200, 30, 43);
  doc.setLineWidth(1.75);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1);
  y += 20;

  // Customer & Vehicle 2-column summary
  const colMid = margin + contentWidth / 2 + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('CUSTOMER', margin, y);
  doc.text('VEHICLE', colMid, y);

  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(wo.customerName, margin, y);
  doc.text(`${wo.vehicleYear} ${wo.vehicleMake} ${wo.vehicleModel}`, colMid, y);

  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Phone: ${wo.customerPhone}`, margin, y);
  doc.text(
    `Plate: ${wo.licensePlate || 'N/A'}   Mileage: ${wo.mileage.toLocaleString()} mi`,
    colMid,
    y
  );

  y += 14;
  if (wo.customerEmail) {
    doc.text(`Email: ${wo.customerEmail}`, margin, y);
  }
  if (wo.vin) {
    doc.text(`VIN: ${wo.vin}`, colMid, y);
  }

  y += 22;
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // Line items header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('SERVICE / PART', margin, y);
  doc.text('QTY', margin + 320, y, { align: 'right' });
  doc.text('UNIT', margin + 405, y, { align: 'right' });
  doc.text('TOTAL', pageWidth - margin, y, { align: 'right' });

  y += 8;
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);

  if (wo.lineItems.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('No line items recorded.', margin, y);
    y += 18;
  } else {
    for (const item of wo.lineItems) {
      if (y > 680) {
        doc.addPage();
        y = 50;
      }
      const lineTotal = item.qty * item.unitPrice;
      const itemLabel = `${item.name}${item.taxable ? '' : ' (Non-tax)'}`;
      const wrapped = doc.splitTextToSize(itemLabel, 285) as string[];
      doc.setTextColor(15, 23, 42);
      doc.text(wrapped, margin, y);
      doc.text(String(item.qty), margin + 320, y, { align: 'right' });
      doc.text(formatCurrency(item.unitPrice), margin + 405, y, { align: 'right' });
      doc.text(formatCurrency(lineTotal), pageWidth - margin, y, { align: 'right' });
      y += Math.max(18, wrapped.length * 13 + 5);
    }
  }

  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // Totals block (right-aligned)
  const labelX = pageWidth - margin - 165;
  const valX = pageWidth - margin;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal', labelX, y);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(wo.subtotal), valX, y, { align: 'right' });
  y += 16;

  if (wo.discount > 0) {
    doc.setTextColor(71, 85, 105);
    doc.text('Discount', labelX, y);
    doc.setTextColor(22, 163, 74);
    doc.text(`-${formatCurrency(wo.discount)}`, valX, y, { align: 'right' });
    y += 16;
  }

  doc.setTextColor(71, 85, 105);
  const displayTaxRate = wo.taxRate <= 1 && wo.taxRate > 0 ? wo.taxRate * 100 : wo.taxRate || 0;
  doc.text(`Iowa Sales Tax (${displayTaxRate.toFixed(2)}%)`, labelX, y);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(wo.taxAmount), valX, y, { align: 'right' });
  y += 10;

  doc.setDrawColor(15, 23, 42);
  doc.line(labelX, y, valX, y);
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total', labelX, y);
  doc.text(formatCurrency(wo.total), valX, y, { align: 'right' });
  y += 20;

  if (wo.status === 'paid' || wo.status === 'voided') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const methodLabel = wo.paymentMethod === 'cash' ? 'Cash' : wo.paymentMethod === 'card' ? 'Card' : 'N/A';
    doc.text(`Payment Method: ${methodLabel}`, labelX, y);
    doc.text(`Paid: ${formatCurrency(wo.amountPaid)}`, valX, y, { align: 'right' });
    y += 14;
    if (wo.paidAt) {
      doc.text(`Paid Date: ${new Date(wo.paidAt).toLocaleString()}`, labelX, y);
      y += 14;
    }
  }

  if (wo.status === 'voided') {
    y += 10;
    doc.setDrawColor(220, 38, 38);
    doc.rect(margin, y, contentWidth, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(220, 38, 38);
    doc.text('THIS RECEIPT HAS BEEN VOIDED', margin + 12, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Reason: ${wo.voidReason || 'Voided by management'} (by ${wo.voidedByName || 'Management'})`,
      margin + 12,
      y + 33
    );
    y += 58;
  }

  if (wo.notes) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('TECHNICIAN / WORK ORDER NOTES', margin, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const noteLines = doc.splitTextToSize(wo.notes, contentWidth) as string[];
    doc.text(noteLines, margin, y);
    y += noteLines.length * 13;
  }

  // Footer
  const footerText =
    company?.receiptFooter || 'Thank you for your business. Torque lug nuts after 50 miles.';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(footerText, pageWidth / 2, 745, { align: 'center' });

  return doc;
}

export function downloadReceiptPdf(wo: WorkOrder, company: CompanyProfile | null): void {
  const doc = buildReceiptPdfDoc(wo, company);
  doc.save(`${wo.orderNumber}_Receipt.pdf`);
}

export function printReceiptPdf(wo: WorkOrder, company: CompanyProfile | null): void {
  const doc = buildReceiptPdfDoc(wo, company);
  const blobUrl = doc.output('bloburl');
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = String(blobUrl);
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      doc.save(`${wo.orderNumber}_Receipt.pdf`);
    }
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 60000);
  };
}

export async function shareReceiptPdf(
  wo: WorkOrder,
  company: CompanyProfile | null
): Promise<'shared' | 'downloaded'> {
  const doc = buildReceiptPdfDoc(wo, company);
  const blob = doc.output('blob');
  const file = new File([blob], `${wo.orderNumber}_Receipt.pdf`, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `${company?.shopName || 'Shop'} Receipt ${wo.orderNumber}`,
        text: `Receipt for ${wo.vehicleYear} ${wo.vehicleMake} ${wo.vehicleModel} — Total ${formatCurrency(wo.total)}`,
        files: [file],
      });
      return 'shared';
    } catch {
      // User canceled or share unsupported in iframe -> fallback to download
    }
  }

  doc.save(`${wo.orderNumber}_Receipt.pdf`);
  return 'downloaded';
}

export function buildReceiptEmailHref(wo: WorkOrder, company: CompanyProfile | null): string {
  const shopName = company?.shopName || 'Arcadia Tire Co.';
  const subject = encodeURIComponent(`${shopName} Receipt — ${wo.orderNumber}`);
  const lines = [
    `Hi ${wo.customerName},`,
    '',
    `Thank you for visiting ${shopName}. Here is your receipt summary for work order ${wo.orderNumber}:`,
    `Vehicle: ${wo.vehicleYear} ${wo.vehicleMake} ${wo.vehicleModel}${wo.licensePlate ? ` (Plate: ${wo.licensePlate})` : ''}`,
    `Mileage: ${wo.mileage.toLocaleString()} mi`,
    '',
    'Services & Parts:',
    ...wo.lineItems.map(
      (item) => `- ${item.qty}x ${item.name}: ${formatCurrency(item.qty * item.unitPrice)}`
    ),
    '',
    `Subtotal: ${formatCurrency(wo.subtotal)}`,
    ...(wo.discount > 0 ? [`Discount: -${formatCurrency(wo.discount)}`] : []),
    `Iowa Sales Tax (${(wo.taxRate <= 1 && wo.taxRate > 0 ? wo.taxRate * 100 : wo.taxRate || 0).toFixed(2)}%): ${formatCurrency(wo.taxAmount)}`,
    `Total: ${formatCurrency(wo.total)}`,
    ...(wo.status === 'paid'
      ? [
          `Paid (${wo.paymentMethod.toUpperCase()}): ${formatCurrency(wo.amountPaid)} on ${new Date(wo.paidAt).toLocaleString()}`,
        ]
      : []),
    '',
    company?.receiptFooter || 'Thank you for your business!',
    company?.phone ? `Questions? Call ${company.phone}` : '',
  ].filter((l) => l !== undefined);

  const body = encodeURIComponent(lines.join('\n'));
  return `mailto:${encodeURIComponent(wo.customerEmail || '')}?subject=${subject}&body=${body}`;
}

export function buildReadyPickupText(wo: WorkOrder, company: CompanyProfile | null): string {
  const shopName = company?.shopName || 'Arcadia Tire Co.';
  const platePart = wo.licensePlate ? ` (${wo.licensePlate})` : '';
  const phonePart = company?.phone ? ` Call us at ${company.phone} with any questions.` : '';
  return `Hi ${wo.customerName}, your ${wo.vehicleYear} ${wo.vehicleMake} ${wo.vehicleModel}${platePart} is ready for pickup at ${shopName}. Work Order ${wo.orderNumber} total is ${formatCurrency(wo.total)}.${phonePart}`;
}

export function buildReadySmsHref(wo: WorkOrder, company: CompanyProfile | null): string {
  const msg = encodeURIComponent(buildReadyPickupText(wo, company));
  const phone = (wo.customerPhone || '').replace(/[^\d+]/g, '');
  return `sms:${phone}?body=${msg}`;
}

export function buildReadyEmailHref(wo: WorkOrder, company: CompanyProfile | null): string {
  const shopName = company?.shopName || 'Arcadia Tire Co.';
  const subject = encodeURIComponent(
    `Your ${wo.vehicleYear} ${wo.vehicleMake} ${wo.vehicleModel} is Ready for Pickup — ${wo.orderNumber}`
  );
  const body = encodeURIComponent(buildReadyPickupText(wo, company));
  return `mailto:${encodeURIComponent(wo.customerEmail || '')}?subject=${subject}&body=${body}`;
}
