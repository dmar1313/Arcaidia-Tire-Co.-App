import type { Customer, ServiceCatalogItem, Vehicle, WorkOrder } from '../types';
import { formatTimestamp } from './calculations';

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return lines.join('\r\n');
}

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportCustomersCsv(customers: Customer[]): void {
  const headers = ['customer_id', 'name', 'phone', 'email', 'notes', 'created_at'];
  const rows = customers.map((c) => [
    c.id,
    c.name,
    c.phone,
    c.email || '',
    c.notes || '',
    formatTimestamp(c.createdAt),
  ]);
  triggerCsvDownload(`customers_${dateStamp()}.csv`, buildCsv(headers, rows));
}

export function exportVehiclesCsv(vehicles: Vehicle[]): void {
  const headers = [
    'vehicle_id',
    'customer_id',
    'customer_name',
    'year',
    'make',
    'model',
    'license_plate',
    'vin',
    'mileage',
    'created_at',
  ];
  const rows = vehicles.map((v) => [
    v.id,
    v.customerId,
    v.customerName,
    v.year,
    v.make,
    v.model,
    v.licensePlate || '',
    v.vin || '',
    v.mileage,
    formatTimestamp(v.createdAt),
  ]);
  triggerCsvDownload(`vehicles_${dateStamp()}.csv`, buildCsv(headers, rows));
}

export function exportWorkOrdersCsv(workOrders: WorkOrder[]): void {
  const headers = [
    'work_order_id',
    'work_order_number',
    'status',
    'created_at',
    'customer_id',
    'customer_name',
    'customer_phone',
    'customer_email',
    'vehicle_id',
    'vehicle_year',
    'vehicle_make',
    'vehicle_model',
    'license_plate',
    'vin',
    'mileage',
    'assigned_mechanic',
    'line_items',
    'subtotal',
    'discount',
    'iowa_tax_rate_pct',
    'tax_amount',
    'total',
    'payment_method',
    'amount_paid',
    'paid_at',
    'paid_by',
    'completed_at',
    'completed_by',
    'created_by',
    'void_reason',
    'voided_at',
    'voided_by',
    'notes',
  ];
  const rows = workOrders.map((wo) => [
    wo.id,
    wo.orderNumber,
    wo.status,
    formatTimestamp(wo.createdAt),
    wo.customerId,
    wo.customerName,
    wo.customerPhone,
    wo.customerEmail || '',
    wo.vehicleId,
    wo.vehicleYear,
    wo.vehicleMake,
    wo.vehicleModel,
    wo.licensePlate || '',
    wo.vin || '',
    wo.mileage,
    wo.assignedMechanicName || '',
    wo.lineItems.map((li) => `${li.qty}x ${li.name} ($${li.unitPrice.toFixed(2)})`).join(' | '),
    wo.subtotal.toFixed(2),
    wo.discount.toFixed(2),
    (wo.taxRate <= 1 && wo.taxRate > 0 ? wo.taxRate * 100 : wo.taxRate || 0).toFixed(2),
    wo.taxAmount.toFixed(2),
    wo.total.toFixed(2),
    wo.paymentMethod,
    wo.amountPaid.toFixed(2),
    wo.paidAt || '',
    wo.paidByName || '',
    wo.completedAt || '',
    wo.completedByName || '',
    wo.createdByName,
    wo.voidReason || '',
    wo.voidedAt || '',
    wo.voidedByName || '',
    wo.notes || '',
  ]);
  triggerCsvDownload(`work_orders_${dateStamp()}.csv`, buildCsv(headers, rows));
}

export function exportPriceListCsv(services: ServiceCatalogItem[]): void {
  const headers = ['service_id', 'name', 'category', 'description', 'unit_price', 'taxable', 'active'];
  const rows = services.map((s) => [
    s.id,
    s.name,
    s.category,
    s.description || '',
    s.unitPrice.toFixed(2),
    s.taxable ? 'true' : 'false',
    s.active ? 'true' : 'false',
  ]);
  triggerCsvDownload(`price_list_${dateStamp()}.csv`, buildCsv(headers, rows));
}

export function exportAllCsvs(data: {
  customers: Customer[];
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
  services: ServiceCatalogItem[];
}): void {
  exportCustomersCsv(data.customers);
  setTimeout(() => exportVehiclesCsv(data.vehicles), 180);
  setTimeout(() => exportWorkOrdersCsv(data.workOrders), 360);
  setTimeout(() => exportPriceListCsv(data.services), 540);
}
