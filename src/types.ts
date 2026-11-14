export type StaffRole = 'management' | 'mechanic';

export type WorkOrderStatus =
  | 'intake'
  | 'in_progress'
  | 'waiting_on_parts'
  | 'ready'
  | 'paid'
  | 'voided';

export type ServiceCategory =
  | 'tire_repair'
  | 'tire_sale'
  | 'oil_change'
  | 'tune_up'
  | 'maintenance'
  | 'part';

export type PaymentMethod = 'none' | 'cash' | 'card';

export type AuditAction =
  | 'created'
  | 'status_changed'
  | 'items_updated'
  | 'completed'
  | 'paid'
  | 'voided';

export interface CompanyProfile {
  id: string;
  shopName: string;
  address: string;
  cityStateZip: string;
  phone: string;
  email: string;
  iowaTaxRate: number;
  workOrderPrefix: string;
  nextOrderNumber: number;
  receiptFooter: string;
  updatedByUid: string;
  updatedAt?: unknown;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  baySpecialty: string;
  active: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  unitPrice: number;
  taxable: boolean;
  active: boolean;
  updatedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Vehicle {
  id: string;
  customerId: string;
  customerName: string;
  year: number;
  make: string;
  model: string;
  licensePlate: string;
  vin: string;
  mileage: number;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WorkOrderLineItem {
  id: string;
  serviceId: string;
  name: string;
  category: ServiceCategory;
  isCatalogService: boolean;
  qty: number;
  unitPrice: number;
  taxable: boolean;
}

export interface WorkOrder {
  id: string;
  orderNumber: string;
  status: WorkOrderStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  vehicleId: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  licensePlate: string;
  vin: string;
  mileage: number;
  assignedMechanicId: string;
  assignedMechanicName: string;
  notes: string;
  lineItems: WorkOrderLineItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  paidAt: string;
  paidByName: string;
  paidByUid: string;
  completedAt: string;
  completedByName: string;
  completedByUid: string;
  voidReason: string;
  voidedAt: string;
  voidedByName: string;
  voidedByUid: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  hasPendingWrites?: boolean;
}

export interface WorkOrderAuditEntry {
  id: string;
  workOrderId: string;
  action: AuditAction;
  details: string;
  actorUid: string;
  actorName: string;
  actorRole: StaffRole;
  createdAt?: unknown;
}

export interface PriceAuditEntry {
  id: string;
  serviceId: string;
  serviceName: string;
  oldPrice: number;
  newPrice: number;
  actorUid: string;
  actorName: string;
  createdAt?: unknown;
}

export interface StaffNotification {
  id: string;
  targetRole: 'management' | 'mechanic' | 'all';
  targetStaffId?: string;
  title: string;
  body: string;
  workOrderId?: string;
  orderNumber?: string;
  createdByUid: string;
  readByUids: string[];
  createdAt?: unknown;
}

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  tire_repair: 'Tire Repair',
  tire_sale: 'Tire Sale',
  oil_change: 'Oil Change',
  tune_up: 'Tune-Up',
  maintenance: 'Maintenance',
  part: 'Parts & Supplies',
};

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  intake: 'Intake',
  in_progress: 'In Progress',
  waiting_on_parts: 'Waiting on Parts',
  ready: 'Ready',
  paid: 'Paid',
  voided: 'Voided',
};

export const BOOTSTRAP_ADMIN_EMAIL = 'a.infj.13@gmail.com';
