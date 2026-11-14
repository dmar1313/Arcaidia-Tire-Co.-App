import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  emailToStaffId,
  handleFirestoreError,
  makeSafeId,
  OperationType,
} from './firebase';
import {
  formatCurrency,
  generateWorkOrderNumber,
} from './calculations';
import type {
  CompanyProfile,
  Customer,
  PaymentMethod,
  ServiceCatalogItem,
  ServiceCategory,
  StaffMember,
  StaffRole,
  Vehicle,
  WorkOrder,
  WorkOrderLineItem,
  WorkOrderStatus,
} from '../types';

export interface ActorInfo {
  uid: string;
  name: string;
  email: string;
  role: StaffRole;
}

async function commitWithOfflineGrace(
  writePromise: Promise<unknown>,
  opType: OperationType,
  path: string
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    // Offline writes stay queued in IndexedDB persistentLocalCache.
    // Attach a handler so late server errors never become unhandled rejections.
    writePromise.catch((err) => {
      console.warn(`Queued offline write (${opType} ${path}) later failed:`, err);
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    return;
  }

  try {
    await writePromise;
  } catch (err) {
    handleFirestoreError(err, opType, path);
  }
}

export async function saveCompanyProfile(
  input: Omit<CompanyProfile, 'id' | 'updatedByUid' | 'updatedAt'>,
  actorUid: string,
  isNew: boolean,
  ownerInfo?: { name: string; email: string }
): Promise<void> {
  const path = 'company/default';
  const payload = {
    id: 'default',
    shopName: input.shopName.trim().slice(0, 120),
    address: input.address.trim().slice(0, 200),
    cityStateZip: input.cityStateZip.trim().slice(0, 120),
    phone: input.phone.trim().slice(0, 40),
    email: input.email.trim().slice(0, 120),
    iowaTaxRate: Math.max(0, Math.min(25, Number(input.iowaTaxRate) || 0)),
    workOrderPrefix: (input.workOrderPrefix.trim() || 'WO-').slice(0, 10),
    nextOrderNumber: Math.max(1, Number(input.nextOrderNumber) || 1001),
    receiptFooter: input.receiptFooter.trim().slice(0, 300),
    updatedByUid: actorUid,
    updatedAt: serverTimestamp(),
  };

  if (isNew) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'company', 'default'), payload);
    batch.set(doc(db, 'shop_status', 'default'), {
      id: 'default',
      initialized: true,
      createdByUid: actorUid,
      createdAt: serverTimestamp(),
    });
    if (ownerInfo?.email) {
      const cleanEmail = ownerInfo.email.trim().toLowerCase().slice(0, 120);
      const staffId = emailToStaffId(cleanEmail);
      batch.set(doc(db, 'staff', staffId), {
        id: staffId,
        name: ownerInfo.name.trim().slice(0, 100) || 'Shop Owner',
        email: cleanEmail,
        role: 'management',
        baySpecialty: 'Owner / Management',
        active: true,
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await commitWithOfflineGrace(batch.commit(), OperationType.CREATE, path);
  } else {
    await commitWithOfflineGrace(
      updateDoc(doc(db, 'company', 'default'), payload),
      OperationType.UPDATE,
      path
    );
  }
}

export async function claimAndCreateShop(input: {
  ownerName: string;
  ownerEmail: string;
  ownerUid: string;
  shopName: string;
  phone: string;
  iowaTaxRate: number;
}): Promise<void> {
  const batch = writeBatch(db);
  const cleanEmail = input.ownerEmail.trim().toLowerCase().slice(0, 120);
  const staffId = emailToStaffId(cleanEmail);

  batch.set(doc(db, 'shop_status', 'default'), {
    id: 'default',
    initialized: true,
    createdByUid: input.ownerUid,
    createdAt: serverTimestamp(),
  });

  batch.set(doc(db, 'company', 'default'), {
    id: 'default',
    shopName: input.shopName.trim().slice(0, 120),
    address: '',
    cityStateZip: '',
    phone: input.phone.trim().slice(0, 40),
    email: cleanEmail,
    iowaTaxRate: Math.max(0, Math.min(25, Number(input.iowaTaxRate) || 7.0)),
    workOrderPrefix: 'WO-',
    nextOrderNumber: 1001,
    receiptFooter: 'Thank you for your business. Torque lug nuts after 50 miles.',
    updatedByUid: input.ownerUid,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'staff', staffId), {
    id: staffId,
    name: input.ownerName.trim().slice(0, 100) || 'Shop Owner',
    email: cleanEmail,
    role: 'management',
    baySpecialty: 'Owner / Management',
    active: true,
    createdByUid: input.ownerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'company/default');
  }
}

export async function upsertStaffMember(
  input: {
    name: string;
    email: string;
    role: StaffRole;
    baySpecialty: string;
    active: boolean;
  },
  existingStaff: StaffMember | undefined,
  actorUid: string
): Promise<void> {
  const cleanEmail = input.email.trim().toLowerCase().slice(0, 120);
  const staffId = existingStaff ? existingStaff.id : emailToStaffId(cleanEmail);
  const path = `staff/${staffId}`;

  if (!existingStaff) {
    await commitWithOfflineGrace(
      setDoc(doc(db, 'staff', staffId), {
        id: staffId,
        name: input.name.trim().slice(0, 100),
        email: cleanEmail,
        role: input.role,
        baySpecialty: input.baySpecialty.trim().slice(0, 80),
        active: input.active,
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      OperationType.CREATE,
      path
    );
  } else {
    await commitWithOfflineGrace(
      updateDoc(doc(db, 'staff', staffId), {
        name: input.name.trim().slice(0, 100),
        role: input.role,
        baySpecialty: input.baySpecialty.trim().slice(0, 80),
        active: input.active,
        updatedAt: serverTimestamp(),
      }),
      OperationType.UPDATE,
      path
    );
  }
}

export async function createServiceCatalogItem(
  input: {
    name: string;
    category: ServiceCategory;
    description: string;
    unitPrice: number;
    taxable: boolean;
    active: boolean;
  },
  actor: ActorInfo
): Promise<void> {
  const id = makeSafeId('svc');
  const path = `services/${id}`;
  await commitWithOfflineGrace(
    setDoc(doc(db, 'services', id), {
      id,
      name: input.name.trim().slice(0, 120),
      category: input.category,
      description: input.description.trim().slice(0, 240),
      unitPrice: Math.max(0, Math.min(50000, Number(input.unitPrice) || 0)),
      taxable: input.taxable,
      active: input.active,
      updatedByUid: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    OperationType.CREATE,
    path
  );
}

export async function updateServiceCatalogItem(
  existing: ServiceCatalogItem,
  input: {
    name: string;
    category: ServiceCategory;
    description: string;
    unitPrice: number;
    taxable: boolean;
    active: boolean;
  },
  actor: ActorInfo
): Promise<void> {
  const newPrice = Math.max(0, Math.min(50000, Number(input.unitPrice) || 0));
  const batch = writeBatch(db);
  const serviceRef = doc(db, 'services', existing.id);

  batch.update(serviceRef, {
    name: input.name.trim().slice(0, 120),
    category: input.category,
    description: input.description.trim().slice(0, 240),
    unitPrice: newPrice,
    taxable: input.taxable,
    active: input.active,
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp(),
  });

  if (Math.abs(newPrice - existing.unitPrice) > 0.001) {
    const logId = makeSafeId('pa');
    batch.set(doc(db, 'price_audit_log', logId), {
      id: logId,
      serviceId: existing.id,
      serviceName: input.name.trim().slice(0, 120),
      oldPrice: existing.unitPrice,
      newPrice,
      actorUid: actor.uid,
      actorName: actor.name.slice(0, 100),
      createdAt: serverTimestamp(),
    });
  }

  await commitWithOfflineGrace(
    batch.commit(),
    OperationType.UPDATE,
    `services/${existing.id}`
  );
}

export async function saveCustomer(
  input: { name: string; phone: string; email: string; notes: string },
  existing: Customer | undefined,
  actorUid: string
): Promise<string> {
  const id = existing ? existing.id : makeSafeId('cust');
  const path = `customers/${id}`;
  if (!existing) {
    await commitWithOfflineGrace(
      setDoc(doc(db, 'customers', id), {
        id,
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 40),
        email: input.email.trim().slice(0, 120),
        notes: input.notes.trim().slice(0, 500),
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      OperationType.CREATE,
      path
    );
  } else {
    await commitWithOfflineGrace(
      updateDoc(doc(db, 'customers', id), {
        name: input.name.trim().slice(0, 120),
        phone: input.phone.trim().slice(0, 40),
        email: input.email.trim().slice(0, 120),
        notes: input.notes.trim().slice(0, 500),
        updatedAt: serverTimestamp(),
      }),
      OperationType.UPDATE,
      path
    );
  }
  return id;
}

export async function saveVehicle(
  input: {
    customerId: string;
    customerName: string;
    year: number;
    make: string;
    model: string;
    licensePlate: string;
    vin: string;
    mileage: number;
  },
  existing: Vehicle | undefined,
  actorUid: string
): Promise<string> {
  const id = existing ? existing.id : makeSafeId('veh');
  const path = `vehicles/${id}`;
  if (!existing) {
    await commitWithOfflineGrace(
      setDoc(doc(db, 'vehicles', id), {
        id,
        customerId: input.customerId,
        customerName: input.customerName.trim().slice(0, 120),
        year: Math.max(1900, Math.min(2100, Number(input.year) || new Date().getFullYear())),
        make: input.make.trim().slice(0, 60),
        model: input.model.trim().slice(0, 60),
        licensePlate: input.licensePlate.trim().toUpperCase().slice(0, 24),
        vin: input.vin.trim().toUpperCase().slice(0, 24),
        mileage: Math.max(0, Math.min(2000000, Number(input.mileage) || 0)),
        createdByUid: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      OperationType.CREATE,
      path
    );
  } else {
    await commitWithOfflineGrace(
      updateDoc(doc(db, 'vehicles', id), {
        customerName: input.customerName.trim().slice(0, 120),
        year: Math.max(1900, Math.min(2100, Number(input.year) || new Date().getFullYear())),
        make: input.make.trim().slice(0, 60),
        model: input.model.trim().slice(0, 60),
        licensePlate: input.licensePlate.trim().toUpperCase().slice(0, 24),
        vin: input.vin.trim().toUpperCase().slice(0, 24),
        mileage: Math.max(0, Math.min(2000000, Number(input.mileage) || 0)),
        updatedAt: serverTimestamp(),
      }),
      OperationType.UPDATE,
      path
    );
  }
  return id;
}

export interface CreateWorkOrderPayload {
  existingCustomer?: Customer;
  newCustomer?: { name: string; phone: string; email: string; notes: string };
  existingVehicle?: Vehicle;
  newVehicle?: {
    year: number;
    make: string;
    model: string;
    licensePlate: string;
    vin: string;
    mileage: number;
  };
  mileageOverride?: number;
  status: WorkOrderStatus;
  assignedMechanicId: string;
  assignedMechanicName: string;
  notes: string;
  lineItems: WorkOrderLineItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  workOrderPrefix: string;
}

export async function createWorkOrderAtomic(
  payload: CreateWorkOrderPayload,
  actor: ActorInfo
): Promise<string> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) {
    throw new Error('Please sign in with a verified Google account before creating a work order.');
  }
  if (!payload.existingCustomer && !payload.newCustomer) {
    throw new Error('Select an existing customer or enter a new customer.');
  }
  if (!payload.existingVehicle && !payload.newVehicle) {
    throw new Error('Select an existing vehicle or enter a new vehicle.');
  }

  const safeActorName =
    (actor.name || actor.email || 'Staff').trim().slice(0, 100) || 'Staff';

  const customerId = payload.existingCustomer?.id || makeSafeId('cust');
  const customerName =
    (payload.existingCustomer?.name || payload.newCustomer?.name || '')
      .trim()
      .slice(0, 120) || 'Walk-In Customer';
  const customerPhone =
    (payload.existingCustomer?.phone || payload.newCustomer?.phone || '')
      .trim()
      .slice(0, 40) || 'N/A';
  const customerEmail = (
    payload.existingCustomer?.email ||
    payload.newCustomer?.email ||
    ''
  )
    .trim()
    .slice(0, 120);

  if (!payload.existingCustomer && payload.newCustomer) {
    await commitWithOfflineGrace(
      setDoc(doc(db, 'customers', customerId), {
        id: customerId,
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        notes: (payload.newCustomer.notes || '').trim().slice(0, 500),
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      OperationType.CREATE,
      `customers/${customerId}`
    );
  }

  const vehicleId = payload.existingVehicle?.id || makeSafeId('veh');
  const rawVehicleYear = Number(
    payload.existingVehicle?.year || payload.newVehicle?.year || new Date().getFullYear()
  );
  const vehicleYear = Math.max(
    1900,
    Math.min(
      2100,
      Number.isFinite(rawVehicleYear) && rawVehicleYear > 0
        ? Math.round(rawVehicleYear)
        : new Date().getFullYear()
    )
  );
  const vehicleMake =
    (payload.existingVehicle?.make || payload.newVehicle?.make || '')
      .trim()
      .slice(0, 60) || 'Vehicle';
  const vehicleModel =
    (payload.existingVehicle?.model || payload.newVehicle?.model || '')
      .trim()
      .slice(0, 60) || 'Model';
  const licensePlate = (
    payload.existingVehicle?.licensePlate ||
    payload.newVehicle?.licensePlate ||
    ''
  )
    .trim()
    .toUpperCase()
    .slice(0, 24);
  const vin = (payload.existingVehicle?.vin || payload.newVehicle?.vin || '')
    .trim()
    .toUpperCase()
    .slice(0, 24);
  const rawMileage = Number(
    payload.mileageOverride ??
      payload.existingVehicle?.mileage ??
      payload.newVehicle?.mileage ??
      0
  );
  const mileage = Math.max(
    0,
    Math.min(2000000, Number.isFinite(rawMileage) ? Math.round(rawMileage) : 0)
  );

  if (!payload.existingVehicle && payload.newVehicle) {
    await commitWithOfflineGrace(
      setDoc(doc(db, 'vehicles', vehicleId), {
        id: vehicleId,
        customerId,
        customerName,
        year: vehicleYear,
        make: vehicleMake,
        model: vehicleModel,
        licensePlate,
        vin,
        mileage,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      OperationType.CREATE,
      `vehicles/${vehicleId}`
    );
  } else if (
    payload.existingVehicle &&
    payload.mileageOverride !== undefined &&
    payload.mileageOverride !== payload.existingVehicle.mileage
  ) {
    await commitWithOfflineGrace(
      updateDoc(doc(db, 'vehicles', vehicleId), {
        mileage,
        updatedAt: serverTimestamp(),
      }),
      OperationType.UPDATE,
      `vehicles/${vehicleId}`
    );
  }

  const woId = makeSafeId('wo');
  const orderNumber = generateWorkOrderNumber(payload.workOrderPrefix);
  const safeStatus: WorkOrderStatus =
    payload.status === 'paid' || payload.status === 'voided' ? 'intake' : payload.status;
  const safeLineItems: WorkOrderLineItem[] = payload.lineItems.slice(0, 30).map((item) => ({
    id: String(item.id || makeSafeId('li')).slice(0, 128),
    serviceId: String(item.serviceId || 'custom').slice(0, 128),
    name: String(item.name || 'Service').trim().slice(0, 120) || 'Service',
    category: item.category || 'maintenance',
    isCatalogService: Boolean(item.isCatalogService),
    qty: Math.max(1, Number(item.qty) || 1),
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    taxable: Boolean(item.taxable),
  }));
  const safeSubtotal = Math.max(0, Number.isFinite(Number(payload.subtotal)) ? Number(payload.subtotal) : 0);
  const safeDiscount =
    actor.role === 'management'
      ? Math.max(0, Math.min(safeSubtotal, Number.isFinite(Number(payload.discount)) ? Number(payload.discount) : 0))
      : 0;
  const safeTaxRate = Math.max(0, Math.min(25, Number.isFinite(Number(payload.taxRate)) ? Number(payload.taxRate) : 0));
  const safeTaxAmount = Math.max(0, Number.isFinite(Number(payload.taxAmount)) ? Number(payload.taxAmount) : 0);
  const safeTotal = Math.max(0, Number.isFinite(Number(payload.total)) ? Number(payload.total) : 0);
  const nowIso = new Date().toISOString();

  await commitWithOfflineGrace(
    setDoc(doc(db, 'work_orders', woId), {
      id: woId,
      orderNumber,
      status: safeStatus,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      vehicleId,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      licensePlate,
      vin,
      mileage,
      assignedMechanicId: '',
      assignedMechanicName: '',
      notes: payload.notes.trim().slice(0, 1000),
      lineItems: safeLineItems,
      subtotal: safeSubtotal,
      discount: safeDiscount,
      taxRate: safeTaxRate,
      taxAmount: safeTaxAmount,
      total: safeTotal,
      paymentMethod: 'none',
      amountPaid: 0,
      paidAt: '',
      paidByName: '',
      paidByUid: '',
      completedAt: safeStatus === 'ready' ? nowIso : '',
      completedByName: safeStatus === 'ready' ? safeActorName : '',
      completedByUid: safeStatus === 'ready' ? actor.uid : '',
      voidReason: '',
      voidedAt: '',
      voidedByName: '',
      voidedByUid: '',
      createdByUid: actor.uid,
      createdByName: safeActorName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    OperationType.CREATE,
    `work_orders/${woId}`
  );

  const auditId = makeSafeId('aud');
  await commitWithOfflineGrace(
    setDoc(doc(collection(db, 'work_orders', woId, 'audit_log'), auditId), {
      id: auditId,
      workOrderId: woId,
      action: 'created',
      details: `Work order ${orderNumber} created for ${customerName} (${vehicleYear} ${vehicleMake} ${vehicleModel})`.slice(0, 500),
      actorUid: actor.uid,
      actorName: safeActorName,
      actorRole: actor.role,
      createdAt: serverTimestamp(),
    }),
    OperationType.CREATE,
    `work_orders/${woId}/audit_log/${auditId}`
  );

  try {
    const notifId = makeSafeId('ntf');
    await commitWithOfflineGrace(
      setDoc(doc(db, 'staff_notifications', notifId), {
        id: notifId,
        targetRole: actor.role === 'mechanic' ? 'management' : 'mechanic',
        targetStaffId: '',
        title: `New Job: ${orderNumber}`.slice(0, 120),
        body: `${vehicleYear} ${vehicleMake} ${vehicleModel}${licensePlate ? ` (${licensePlate})` : ''} · ${customerName}`.slice(
          0,
          300
        ),
        workOrderId: woId,
        orderNumber,
        createdByUid: actor.uid,
        readByUids: [actor.uid],
        createdAt: serverTimestamp(),
      }),
      OperationType.CREATE,
      `staff_notifications/${notifId}`
    );
  } catch (err) {
    console.warn('Non-fatal staff notification error:', err);
  }

  return woId;
}

export async function updateActiveWorkOrder(
  existing: WorkOrder,
  updates: {
    status: WorkOrderStatus;
    assignedMechanicId: string;
    assignedMechanicName: string;
    notes: string;
    mileage: number;
    lineItems: WorkOrderLineItem[];
    subtotal: number;
    discount: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  },
  actor: ActorInfo
): Promise<void> {
  if (existing.status === 'paid' || existing.status === 'voided') {
    throw new Error('Paid or voided work orders cannot be edited.');
  }

  const safeActorName =
    (actor.name || actor.email || 'Staff').trim().slice(0, 100) || 'Staff';
  const woRef = doc(db, 'work_orders', existing.id);
  const nextStatus: WorkOrderStatus =
    updates.status === 'paid' || updates.status === 'voided' ? existing.status : updates.status;
  const becameReady = nextStatus === 'ready' && existing.status !== 'ready';
  const becamePartsHold =
    nextStatus === 'waiting_on_parts' && existing.status !== 'waiting_on_parts';
  const nowIso = new Date().toISOString();

  const safeLineItems: WorkOrderLineItem[] = (updates.lineItems || []).slice(0, 30).map((item) => ({
    id: String(item.id || makeSafeId('li')).slice(0, 128),
    serviceId: String(item.serviceId || 'custom').slice(0, 128),
    name: String(item.name || 'Service').trim().slice(0, 120) || 'Service',
    category: item.category || 'maintenance',
    isCatalogService: Boolean(item.isCatalogService),
    qty: Math.max(1, Number(item.qty) || 1),
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    taxable: Boolean(item.taxable),
  }));
  const safeSubtotal = Math.max(0, Number.isFinite(Number(updates.subtotal)) ? Number(updates.subtotal) : 0);
  const safeTaxAmount = Math.max(0, Number.isFinite(Number(updates.taxAmount)) ? Number(updates.taxAmount) : 0);
  const safeTotal = Math.max(0, Number.isFinite(Number(updates.total)) ? Number(updates.total) : 0);
  const safeMileage = Math.max(
    0,
    Math.min(2000000, Number.isFinite(Number(updates.mileage)) ? Math.round(Number(updates.mileage)) : 0)
  );

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    notes: (updates.notes || '').trim().slice(0, 1000),
    mileage: safeMileage,
    lineItems: safeLineItems,
    subtotal: safeSubtotal,
    taxAmount: safeTaxAmount,
    total: safeTotal,
    completedAt: becameReady ? nowIso : nextStatus === 'ready' ? existing.completedAt || '' : '',
    completedByName: becameReady
      ? safeActorName
      : nextStatus === 'ready'
      ? existing.completedByName || ''
      : '',
    completedByUid: becameReady
      ? actor.uid
      : nextStatus === 'ready'
      ? existing.completedByUid || ''
      : '',
    updatedAt: serverTimestamp(),
  };

  if (actor.role === 'management') {
    updatePayload.discount = Math.max(
      0,
      Math.min(
        safeSubtotal,
        Number.isFinite(Number(updates.discount)) ? Number(updates.discount) : 0
      )
    );
    updatePayload.taxRate = Math.max(
      0,
      Math.min(25, Number.isFinite(Number(updates.taxRate)) ? Number(updates.taxRate) : 0)
    );
  }

  await commitWithOfflineGrace(
    updateDoc(woRef, updatePayload),
    OperationType.UPDATE,
    `work_orders/${existing.id}`
  );

  const changes: string[] = [];
  if (nextStatus !== existing.status) {
    changes.push(`Status: ${existing.status.replace(/_/g, ' ')} → ${nextStatus.replace(/_/g, ' ')}`);
  }
  if (
    safeLineItems.length !== (existing.lineItems || []).length ||
    Math.abs(safeTotal - (existing.total || 0)) > 0.009
  ) {
    changes.push(`Updated items/total (${formatCurrency(safeTotal)})`);
  }
  if ((updates.notes || '').trim() !== (existing.notes || '').trim()) {
    changes.push('Updated notes');
  }
  if (changes.length === 0) {
    changes.push('Saved work order details');
  }

  const auditId = makeSafeId('aud');
  await commitWithOfflineGrace(
    setDoc(doc(collection(db, 'work_orders', existing.id, 'audit_log'), auditId), {
      id: auditId,
      workOrderId: existing.id,
      action: becameReady ? 'completed' : nextStatus !== existing.status ? 'status_changed' : 'items_updated',
      details: changes.join(' · ').slice(0, 500),
      actorUid: actor.uid,
      actorName: safeActorName,
      actorRole: actor.role,
      createdAt: serverTimestamp(),
    }),
    OperationType.CREATE,
    `work_orders/${existing.id}/audit_log/${auditId}`
  );

  if (becameReady || becamePartsHold) {
    try {
      const notifId = makeSafeId('ntf');
      await commitWithOfflineGrace(
        setDoc(doc(db, 'staff_notifications', notifId), {
          id: notifId,
          targetRole: 'management',
          title: (becameReady
            ? `Job Ready: ${existing.orderNumber}`
            : `Waiting on Parts: ${existing.orderNumber}`
          ).slice(0, 120),
          body: (becameReady
            ? `${existing.vehicleYear} ${existing.vehicleMake} ${existing.vehicleModel} marked Ready by ${safeActorName} (${formatCurrency(safeTotal)})`
            : `${existing.vehicleYear} ${existing.vehicleMake} ${existing.vehicleModel} placed on Waiting on Parts by ${safeActorName}`
          ).slice(0, 300),
          workOrderId: existing.id,
          orderNumber: existing.orderNumber,
          createdByUid: actor.uid,
          readByUids: [actor.uid],
          createdAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        `staff_notifications/${notifId}`
      );
    } catch (err) {
      console.warn('Non-fatal staff notification error:', err);
    }
  }
}

export async function quickUpdateWorkOrderStatus(
  existing: WorkOrder,
  nextStatus: WorkOrderStatus,
  actor: ActorInfo
): Promise<void> {
  if (existing.status === 'paid' || existing.status === 'voided') {
    throw new Error('Paid or voided work orders cannot be changed.');
  }
  if (nextStatus === 'paid' || nextStatus === 'voided') {
    throw new Error('Use the payment or void workflow for closed work orders.');
  }

  const safeActorName =
    (actor.name || actor.email || 'Staff').trim().slice(0, 100) || 'Staff';
  const becameReady = nextStatus === 'ready' && existing.status !== 'ready';
  const becamePartsHold =
    nextStatus === 'waiting_on_parts' && existing.status !== 'waiting_on_parts';
  const nowIso = new Date().toISOString();

  await commitWithOfflineGrace(
    updateDoc(doc(db, 'work_orders', existing.id), {
      status: nextStatus,
      completedAt: becameReady ? nowIso : nextStatus === 'ready' ? existing.completedAt || '' : '',
      completedByName: becameReady
        ? safeActorName
        : nextStatus === 'ready'
        ? existing.completedByName || ''
        : '',
      completedByUid: becameReady
        ? actor.uid
        : nextStatus === 'ready'
        ? existing.completedByUid || ''
        : '',
      updatedAt: serverTimestamp(),
    }),
    OperationType.UPDATE,
    `work_orders/${existing.id}`
  );

  const auditId = makeSafeId('aud');
  await commitWithOfflineGrace(
    setDoc(doc(collection(db, 'work_orders', existing.id, 'audit_log'), auditId), {
      id: auditId,
      workOrderId: existing.id,
      action: becameReady ? 'completed' : 'status_changed',
      details: `Status: ${existing.status.replace(/_/g, ' ')} → ${nextStatus.replace(/_/g, ' ')}`.slice(0, 500),
      actorUid: actor.uid,
      actorName: safeActorName,
      actorRole: actor.role,
      createdAt: serverTimestamp(),
    }),
    OperationType.CREATE,
    `work_orders/${existing.id}/audit_log/${auditId}`
  );

  if (becameReady || becamePartsHold) {
    try {
      const notifId = makeSafeId('ntf');
      await commitWithOfflineGrace(
        setDoc(doc(db, 'staff_notifications', notifId), {
          id: notifId,
          targetRole: 'management',
          title: (becameReady
            ? `Job Ready: ${existing.orderNumber}`
            : `Waiting on Parts: ${existing.orderNumber}`
          ).slice(0, 120),
          body: (becameReady
            ? `${existing.vehicleYear} ${existing.vehicleMake} ${existing.vehicleModel} marked Ready by ${safeActorName} (${formatCurrency(existing.total || 0)})`
            : `${existing.vehicleYear} ${existing.vehicleMake} ${existing.vehicleModel} placed on Waiting on Parts by ${safeActorName}`
          ).slice(0, 300),
          workOrderId: existing.id,
          orderNumber: existing.orderNumber,
          createdByUid: actor.uid,
          readByUids: [actor.uid],
          createdAt: serverTimestamp(),
        }),
        OperationType.CREATE,
        `staff_notifications/${notifId}`
      );
    } catch (err) {
      console.warn('Non-fatal staff notification error:', err);
    }
  }
}

export async function markWorkOrderPaid(
  existing: WorkOrder,
  paymentMethod: Exclude<PaymentMethod, 'none'>,
  amountPaid: number,
  actor: ActorInfo
): Promise<void> {
  if (actor.role !== 'management') {
    throw new Error('Only management can mark work orders as paid.');
  }
  const safeActorName =
    (actor.name || actor.email || 'Management').trim().slice(0, 100) || 'Management';
  const batch = writeBatch(db);
  const nowIso = new Date().toISOString();

  batch.update(doc(db, 'work_orders', existing.id), {
    status: 'paid',
    paymentMethod,
    amountPaid: Math.max(0, Number(amountPaid) || 0),
    paidAt: nowIso,
    paidByName: safeActorName,
    paidByUid: actor.uid,
    completedAt: existing.completedAt || nowIso,
    completedByName: existing.completedByName || safeActorName,
    completedByUid: existing.completedByUid || actor.uid,
    updatedAt: serverTimestamp(),
  });

  const auditId = makeSafeId('aud');
  batch.set(doc(collection(db, 'work_orders', existing.id, 'audit_log'), auditId), {
    id: auditId,
    workOrderId: existing.id,
    action: 'paid',
    details: `Marked Paid via ${paymentMethod.toUpperCase()} for ${formatCurrency(amountPaid)}`.slice(0, 500),
    actorUid: actor.uid,
    actorName: safeActorName,
    actorRole: actor.role,
    createdAt: serverTimestamp(),
  });

  await commitWithOfflineGrace(
    batch.commit(),
    OperationType.UPDATE,
    `work_orders/${existing.id}`
  );
}

export async function voidPaidWorkOrder(
  existing: WorkOrder,
  voidReason: string,
  actor: ActorInfo
): Promise<void> {
  if (actor.role !== 'management') {
    throw new Error('Only management can void paid work orders.');
  }
  const cleanReason = voidReason.trim().slice(0, 400);
  if (cleanReason.length < 3) {
    throw new Error('Please enter a void reason (at least 3 characters).');
  }

  const safeActorName =
    (actor.name || actor.email || 'Management').trim().slice(0, 100) || 'Management';
  const batch = writeBatch(db);
  const nowIso = new Date().toISOString();

  batch.update(doc(db, 'work_orders', existing.id), {
    status: 'voided',
    voidReason: cleanReason,
    voidedAt: nowIso,
    voidedByName: safeActorName,
    voidedByUid: actor.uid,
    updatedAt: serverTimestamp(),
  });

  const auditId = makeSafeId('aud');
  batch.set(doc(collection(db, 'work_orders', existing.id, 'audit_log'), auditId), {
    id: auditId,
    workOrderId: existing.id,
    action: 'voided',
    details: `Voided by management: ${cleanReason}`.slice(0, 500),
    actorUid: actor.uid,
    actorName: safeActorName,
    actorRole: actor.role,
    createdAt: serverTimestamp(),
  });

  await commitWithOfflineGrace(
    batch.commit(),
    OperationType.UPDATE,
    `work_orders/${existing.id}`
  );
}

export async function markNotificationRead(
  notificationId: string,
  uid: string,
  currentReadByUids: string[]
): Promise<void> {
  if (currentReadByUids.includes(uid)) return;
  const next = [...currentReadByUids, uid].slice(0, 30);
  await commitWithOfflineGrace(
    updateDoc(doc(db, 'staff_notifications', notificationId), {
      readByUids: next,
    }),
    OperationType.UPDATE,
    `staff_notifications/${notificationId}`
  );
}
