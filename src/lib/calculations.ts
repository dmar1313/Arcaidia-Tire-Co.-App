import type { WorkOrderLineItem } from '../types';

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function calculateWorkOrderTotals(
  lineItems: WorkOrderLineItem[],
  discountInput: number,
  taxRatePercent: number
): {
  subtotal: number;
  discount: number;
  taxableSubtotal: number;
  taxAmount: number;
  total: number;
} {
  const subtotal = roundCents(
    lineItems.reduce((sum, item) => sum + Math.max(0, item.qty) * Math.max(0, item.unitPrice), 0)
  );
  const discount = roundCents(Math.min(subtotal, Math.max(0, discountInput || 0)));

  const rawTaxable = roundCents(
    lineItems.reduce(
      (sum, item) =>
        item.taxable ? sum + Math.max(0, item.qty) * Math.max(0, item.unitPrice) : sum,
      0
    )
  );

  // Proportionally reduce taxable base when a work-order discount is applied
  const discountRatio = subtotal > 0 ? discount / subtotal : 0;
  const taxableSubtotal = roundCents(Math.max(0, rawTaxable * (1 - discountRatio)));
  const taxRate = Math.max(0, taxRatePercent || 0) / 100;
  const taxAmount = roundCents(taxableSubtotal * taxRate);
  const total = roundCents(Math.max(0, subtotal - discount + taxAmount));

  return {
    subtotal,
    discount,
    taxableSubtotal,
    taxAmount,
    total,
  };
}

export function generateWorkOrderNumber(prefix: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  const cleanPrefix = (prefix || 'WO-').trim().slice(0, 10);
  return `${cleanPrefix}${yy}${mm}${dd}-${suffix}`;
}

function toJsDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      const d = maybeTs.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof maybeTs.seconds === 'number') {
      const d = new Date(maybeTs.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

export function formatTimestamp(value: unknown): string {
  if (!value) return 'Pending sync';
  const d = toJsDate(value);
  if (d) return d.toLocaleString();
  if (typeof value === 'string') return value;
  return 'Just now';
}

export function isSameLocalDay(value: unknown, referenceDate = new Date()): boolean {
  if (!value) return true; // Newly created offline local write counts as today
  const d = toJsDate(value);
  if (!d) return true;
  return (
    d.getFullYear() === referenceDate.getFullYear() &&
    d.getMonth() === referenceDate.getMonth() &&
    d.getDate() === referenceDate.getDate()
  );
}
