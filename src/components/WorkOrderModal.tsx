import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  CreditCard,
  Download,
  History,
  Lock,
  Mail,
  MessageSquare,
  Plus,
  Printer,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { BrandLogo, DEFAULT_SHOP_NAME } from './BrandLogo';
import {
  db,
  formatAppError,
  handleFirestoreError,
  makeSafeId,
  OperationType,
} from '../lib/firebase';
import { calculateWorkOrderTotals, formatCurrency, formatTimestamp } from '../lib/calculations';
import {
  buildReadyEmailHref,
  buildReadyPickupText,
  buildReadySmsHref,
  buildReceiptEmailHref,
  downloadReceiptPdf,
  shareReceiptPdf,
} from '../lib/pdfReceipt';
import {
  createWorkOrderAtomic,
  markWorkOrderPaid,
  updateActiveWorkOrder,
  voidPaidWorkOrder,
  type ActorInfo,
} from '../lib/shopService';
import {
  SERVICE_CATEGORY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type CompanyProfile,
  type Customer,
  type PaymentMethod,
  type ServiceCatalogItem,
  type ServiceCategory,
  type StaffRole,
  type Vehicle,
  type WorkOrder,
  type WorkOrderAuditEntry,
  type WorkOrderLineItem,
  type WorkOrderStatus,
} from '../types';

interface WorkOrderModalProps {
  existingOrder: WorkOrder | null;
  initialCustomer?: Customer | null;
  initialVehicle?: Vehicle | null;
  customers: Customer[];
  vehicles: Vehicle[];
  services: ServiceCatalogItem[];
  company: CompanyProfile | null;
  actor: ActorInfo;
  effectiveRole: StaffRole;
  onClose: () => void;
}

const ACTIVE_STATUSES: WorkOrderStatus[] = [
  'intake',
  'in_progress',
  'waiting_on_parts',
  'ready',
];

export const WorkOrderModal: React.FC<WorkOrderModalProps> = ({
  existingOrder,
  initialCustomer,
  initialVehicle,
  customers,
  vehicles,
  services,
  company,
  actor,
  effectiveRole,
  onClose,
}) => {
  const isPaidOrVoided =
    existingOrder?.status === 'paid' || existingOrder?.status === 'voided';
  const isManagerView = effectiveRole === 'management';

  // Customer & Vehicle selection for new orders
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(
    initialCustomer || customers.length > 0 ? 'existing' : 'new'
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomer?.id || initialVehicle?.customerId || ''
  );
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');

  const [vehicleMode, setVehicleMode] = useState<'existing' | 'new'>(
    initialVehicle ? 'existing' : 'new'
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    initialVehicle?.id || ''
  );
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear());
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [newVin, setNewVin] = useState('');
  const [newMileage, setNewMileage] = useState<number>(0);

  // Order fields
  const [status, setStatus] = useState<WorkOrderStatus>(existingOrder?.status || 'intake');
  const [mileage, setMileage] = useState<number>(
    existingOrder?.mileage ?? initialVehicle?.mileage ?? 0
  );
  const [notes, setNotes] = useState<string>(existingOrder?.notes || '');
  const [lineItems, setLineItems] = useState<WorkOrderLineItem[]>(
    existingOrder?.lineItems || []
  );
  const [discount, setDiscount] = useState<number>(existingOrder?.discount || 0);
  const [taxRate, setTaxRate] = useState<number>(
    existingOrder?.taxRate ?? company?.iowaTaxRate ?? 7.0
  );

  // Catalog picker filter
  const [catalogCategory, setCatalogCategory] = useState<'all' | ServiceCategory>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Custom part form (management only for price override; mechanics use fixed catalog)
  const [customPartName, setCustomPartName] = useState('');
  const [customPartPrice, setCustomPartPrice] = useState('');
  const [customPartQty, setCustomPartQty] = useState(1);

  // Payment & Void panels
  const [showPayPanel, setShowPayPanel] = useState(false);
  const [payMethod, setPayMethod] = useState<Exclude<PaymentMethod, 'none'>>('card');
  const [payAmount, setPayAmount] = useState<string>('');
  const [showVoidPanel, setShowVoidPanel] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // Audit log
  const [activeTab, setActiveTab] = useState<'order' | 'audit'>('order');
  const [auditEntries, setAuditEntries] = useState<WorkOrderAuditEntry[]>([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => {
    if (!existingOrder) return;
    setStatus(existingOrder.status);
    if (existingOrder.status === 'paid' || existingOrder.status === 'voided') {
      setLineItems(existingOrder.lineItems || []);
      setDiscount(existingOrder.discount || 0);
      setTaxRate(existingOrder.taxRate ?? 7.0);
      setMileage(existingOrder.mileage ?? 0);
      setNotes(existingOrder.notes || '');
      setShowPayPanel(false);
      if (existingOrder.status === 'voided') {
        setShowVoidPanel(false);
      }
    }
    // Only sync when the order ID or persisted status actually changes so metadata updates don't reset edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingOrder?.id, existingOrder?.status]);

  useEffect(() => {
    if (!existingOrder) return;
    const path = `work_orders/${existingOrder.id}/audit_log`;
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAuditEntries(snap.docs.map((d) => d.data() as WorkOrderAuditEntry));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return unsub;
  }, [existingOrder]);

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === selectedCustomerId),
    [vehicles, selectedCustomerId]
  );

  useEffect(() => {
    if (existingOrder) return;
    if (customerMode === 'existing' && selectedCustomerId) {
      const matching = vehicles.filter((v) => v.customerId === selectedCustomerId);
      if (matching.length > 0 && !matching.some((v) => v.id === selectedVehicleId)) {
        setSelectedVehicleId(matching[0].id);
        setVehicleMode('existing');
        setMileage(matching[0].mileage);
      } else if (matching.length === 0) {
        setVehicleMode('new');
        setSelectedVehicleId('');
      }
    }
  }, [selectedCustomerId, customerMode, vehicles, existingOrder, selectedVehicleId]);

  const totals = useMemo(
    () => calculateWorkOrderTotals(lineItems, discount, taxRate),
    [lineItems, discount, taxRate]
  );

  const activeCatalogServices = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return services.filter((s) => {
      if (!s.active) return false;
      if (catalogCategory !== 'all' && s.category !== catalogCategory) return false;
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [services, catalogCategory, catalogSearch]);

  const addCatalogItem = (svc: ServiceCatalogItem) => {
    if (isPaidOrVoided) return;
    setLineItems((prev) => {
      const existingIdx = prev.findIndex((li) => li.serviceId === svc.id);
      if (existingIdx >= 0) {
        return prev.map((li, idx) =>
          idx === existingIdx ? { ...li, qty: li.qty + 1 } : li
        );
      }
      if (prev.length >= 30) return prev;
      return [
        ...prev,
        {
          id: makeSafeId('li'),
          serviceId: svc.id,
          name: svc.name,
          category: svc.category,
          isCatalogService: true,
          qty: 1,
          unitPrice: svc.unitPrice,
          taxable: svc.taxable,
        },
      ];
    });
  };

  const addCustomPartItem = () => {
    if (!isManagerView || isPaidOrVoided) return;
    const price = Number(customPartPrice);
    if (!customPartName.trim() || Number.isNaN(price) || price < 0) return;
    if (lineItems.length >= 30) return;
    setLineItems((prev) => [
      ...prev,
      {
        id: makeSafeId('li'),
        serviceId: 'custom',
        name: customPartName.trim().slice(0, 120),
        category: 'part',
        isCatalogService: false,
        qty: Math.max(1, customPartQty),
        unitPrice: price,
        taxable: true,
      },
    ]);
    setCustomPartName('');
    setCustomPartPrice('');
    setCustomPartQty(1);
  };

  const updateLineQty = (id: string, qty: number) => {
    if (isPaidOrVoided) return;
    setLineItems((prev) =>
      prev.map((li) => (li.id === id ? { ...li, qty: Math.max(1, Math.min(99, qty)) } : li))
    );
  };

  const updateLinePrice = (id: string, unitPrice: number) => {
    if (!isManagerView || isPaidOrVoided) return;
    setLineItems((prev) =>
      prev.map((li) =>
        li.id === id ? { ...li, unitPrice: Math.max(0, Number(unitPrice) || 0) } : li
      )
    );
  };

  const removeLineItem = (id: string) => {
    if (isPaidOrVoided) return;
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const effectiveActor: ActorInfo = { ...actor, role: effectiveRole };

    const sanitizedLineItems: WorkOrderLineItem[] = isManagerView
      ? lineItems
      : lineItems.map((li) => {
          const origItem = (existingOrder?.lineItems || []).find((orig) => orig.id === li.id);
          if (origItem) {
            return {
              ...li,
              unitPrice: origItem.unitPrice,
              taxable: origItem.taxable,
            };
          }
          const catalogItem = services.find((svc) => svc.id === li.serviceId);
          if (catalogItem) {
            return {
              ...li,
              unitPrice: catalogItem.unitPrice,
              taxable: catalogItem.taxable,
            };
          }
          return li;
        });

    const lockedDiscount = isManagerView
      ? totals.discount
      : existingOrder
      ? existingOrder.discount ?? 0
      : 0;
    const lockedTaxRate = isManagerView
      ? taxRate
      : existingOrder
      ? existingOrder.taxRate ?? company?.iowaTaxRate ?? 7.0
      : company?.iowaTaxRate ?? 7.0;
    const finalTotals = calculateWorkOrderTotals(
      sanitizedLineItems,
      lockedDiscount,
      lockedTaxRate
    );

    if (!existingOrder) {
      // Validate customer & vehicle
      const existingCust =
        customerMode === 'existing'
          ? customers.find((c) => c.id === selectedCustomerId)
          : undefined;
      if (customerMode === 'existing' && !existingCust) {
        setErrorMsg('Select a customer or create a new customer.');
        return;
      }
      if (customerMode === 'new' && (!newCustomerName.trim() || !newCustomerPhone.trim())) {
        setErrorMsg('Customer name and phone number are required.');
        return;
      }

      const existingVeh =
        customerMode === 'existing' && vehicleMode === 'existing'
          ? vehicles.find((v) => v.id === selectedVehicleId)
          : undefined;

      if (customerMode === 'existing' && vehicleMode === 'existing' && !existingVeh) {
        setErrorMsg('Select a vehicle or add a new vehicle.');
        return;
      }

      if (
        (customerMode === 'new' || vehicleMode === 'new') &&
        (!newMake.trim() || !newModel.trim())
      ) {
        setErrorMsg('Vehicle year, make, and model are required.');
        return;
      }

      setSaving(true);
      try {
        await createWorkOrderAtomic(
          {
            existingCustomer: existingCust,
            newCustomer:
              customerMode === 'new'
                ? {
                    name: newCustomerName,
                    phone: newCustomerPhone,
                    email: newCustomerEmail,
                    notes: '',
                  }
                : undefined,
            existingVehicle: existingVeh,
            newVehicle:
              customerMode === 'new' || vehicleMode === 'new'
                ? {
                    year: newYear,
                    make: newMake,
                    model: newModel,
                    licensePlate: newPlate,
                    vin: newVin,
                    mileage: newMileage,
                  }
                : undefined,
            mileageOverride: existingVeh ? mileage : undefined,
            status,
            assignedMechanicId: '',
            assignedMechanicName: '',
            notes,
            lineItems: sanitizedLineItems,
            subtotal: finalTotals.subtotal,
            discount: lockedDiscount,
            taxRate: lockedTaxRate,
            taxAmount: finalTotals.taxAmount,
            total: finalTotals.total,
            workOrderPrefix: company?.workOrderPrefix || 'WO-',
          },
          effectiveActor
        );
        onClose();
      } catch (err) {
        setErrorMsg(formatAppError(err, 'Unable to save work order.'));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (isPaidOrVoided) return;
    setSaving(true);
    try {
      await updateActiveWorkOrder(
        existingOrder,
        {
          status,
          assignedMechanicId: existingOrder.assignedMechanicId || '',
          assignedMechanicName: existingOrder.assignedMechanicName || '',
          notes,
          mileage,
          lineItems: sanitizedLineItems,
          subtotal: finalTotals.subtotal,
          discount: lockedDiscount,
          taxRate: lockedTaxRate,
          taxAmount: finalTotals.taxAmount,
          total: finalTotals.total,
        },
        effectiveActor
      );
      onClose();
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to update work order.'));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!existingOrder || !isManagerView) return;
    const amt = Number(payAmount);
    if (payAmount.trim() === '' || Number.isNaN(amt) || amt < 0) {
      setErrorMsg('Enter a valid payment amount.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await markWorkOrderPaid(existingOrder, payMethod, amt, {
        ...actor,
        role: effectiveRole,
      });
      setShowPayPanel(false);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Could not mark work order paid.'));
    } finally {
      setSaving(false);
    }
  };

  const handleVoidOrder = async () => {
    if (!existingOrder || !isManagerView) return;
    if (voidReason.trim().length < 3) {
      setErrorMsg('Please enter a reason (at least 3 characters) to void this paid order.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await voidPaidWorkOrder(existingOrder, voidReason, { ...actor, role: effectiveRole });
      setShowVoidPanel(false);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Could not void work order.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyReadyText = async () => {
    if (!existingOrder) return;
    const text = buildReadyPickupText(existingOrder, company);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  const handleSharePdf = async () => {
    if (!existingOrder) return;
    const result = await shareReceiptPdf(existingOrder, company);
    setShareToast(
      result === 'shared'
        ? 'Receipt PDF shared.'
        : 'PDF downloaded — attach it to your email or text.'
    );
    setTimeout(() => setShareToast(null), 3500);
  };

  const printCustomerName =
    existingOrder?.customerName ||
    (customerMode === 'existing'
      ? customers.find((c) => c.id === selectedCustomerId)?.name || 'Customer'
      : newCustomerName || 'Customer');
  const printCustomerPhone =
    existingOrder?.customerPhone ||
    (customerMode === 'existing'
      ? customers.find((c) => c.id === selectedCustomerId)?.phone || ''
      : newCustomerPhone || '');
  const printCustomerEmail =
    existingOrder?.customerEmail ||
    (customerMode === 'existing'
      ? customers.find((c) => c.id === selectedCustomerId)?.email || ''
      : newCustomerEmail || '');

  const selectedVehObj =
    customerMode === 'existing' && vehicleMode === 'existing'
      ? vehicles.find((v) => v.id === selectedVehicleId)
      : undefined;
  const printVehicleTitle = existingOrder
    ? `${existingOrder.vehicleYear} ${existingOrder.vehicleMake} ${existingOrder.vehicleModel}`
    : selectedVehObj
    ? `${selectedVehObj.year} ${selectedVehObj.make} ${selectedVehObj.model}`
    : `${newYear} ${newMake} ${newModel}`.trim() || 'Vehicle';
  const printPlate = existingOrder?.licensePlate || selectedVehObj?.licensePlate || newPlate || 'N/A';
  const printVin = existingOrder?.vin || selectedVehObj?.vin || newVin || '';
  const printMileage = existingOrder ? mileage : selectedVehObj ? mileage : newMileage;
  const shopAddressLine = [company?.address, company?.cityStateZip].filter(Boolean).join(', ');
  const shopContactLine = [company?.phone, company?.email].filter(Boolean).join(' · ');

  return (
    <div className="print-modal-root fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/50 md:p-6">
      <div className="print-modal-card w-full max-w-4xl max-h-[92dvh] md:max-h-[92vh] bg-white rounded-t-2xl md:rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="no-print px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">
                {existingOrder ? existingOrder.orderNumber : 'NEW WORK ORDER'}
              </span>
              {existingOrder && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{WORK_ORDER_STATUS_LABELS[existingOrder.status]}</span>
                </>
              )}
              {!isManagerView && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Lock className="h-3 w-3" /> Fixed Price List
                  </span>
                </>
              )}
            </div>
            <h2 className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 truncate">
              {existingOrder
                ? `${existingOrder.vehicleYear} ${existingOrder.vehicleMake} ${existingOrder.vehicleModel} — ${existingOrder.customerName}`
                : 'Create Work Order'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {existingOrder && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setActiveTab('order')}
                  className={`px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'order' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Order
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('audit')}
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <History className="h-3 w-3" />
                  Audit ({auditEntries.length})
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="no-print flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-5 sm:space-y-6">
          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {shareToast && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
              {shareToast}
            </div>
          )}

          {activeTab === 'audit' && existingOrder ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                Immutable audit log for {existingOrder.orderNumber}. Deletions are disabled across
                all shop records.
              </p>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {auditEntries.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">No audit entries recorded yet.</p>
                ) : (
                  auditEntries.map((entry) => (
                    <div key={entry.id} className="p-3.5 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{entry.details}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {entry.actorName} ({entry.actorRole})
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <form id="work-order-form" onSubmit={handleSave} className="space-y-6">
              {/* Voided Banner */}
              {existingOrder?.status === 'voided' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-1">
                  <p className="font-semibold flex items-center gap-2">
                    <Ban className="h-4 w-4" />
                    Work Order Voided
                  </p>
                  <p className="text-xs">
                    Reason: {existingOrder.voidReason} · Voided by {existingOrder.voidedByName} on{' '}
                    {new Date(existingOrder.voidedAt).toLocaleString()}
                  </p>
                </div>
              )}

              {/* Paid Banner & Receipt Actions */}
              {existingOrder && (existingOrder.status === 'paid' || existingOrder.status === 'voided' || existingOrder.status === 'ready') && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        {existingOrder.status === 'paid'
                          ? `Paid via ${existingOrder.paymentMethod.toUpperCase()} · ${formatCurrency(
                              existingOrder.amountPaid
                            )}`
                          : existingOrder.status === 'voided'
                          ? 'Voided Receipt Archive'
                          : 'Vehicle Ready — Receipt & Customer Notification'}
                      </p>
                      {existingOrder.paidAt && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Paid {new Date(existingOrder.paidAt).toLocaleString()} · Recorded by{' '}
                          {existingOrder.paidByName}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => downloadReceiptPdf(existingOrder, company)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 min-h-[38px]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 min-h-[38px]"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={handleSharePdf}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 min-h-[38px]"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share PDF
                      </button>
                      <a
                        href={buildReceiptEmailHref(existingOrder, company)}
                        onClick={() => downloadReceiptPdf(existingOrder, company)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 min-h-[38px]"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Email Receipt
                      </a>
                    </div>
                  </div>

                  {existingOrder.status === 'ready' && (
                    <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-600">
                        Notify customer vehicle is ready (SMS or Email):
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={buildReadySmsHref(existingOrder, company)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Text Customer (SMS)
                        </a>
                        <a
                          href={buildReadyEmailHref(existingOrder, company)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Email Ready
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyReadyText}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {copiedMsg ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedMsg ? 'Copied' : 'Copy Text'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Customer & Vehicle Section */}
              {existingOrder ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-200 rounded-xl p-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">Customer</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {existingOrder.customerName}
                    </p>
                    <p className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                      {existingOrder.customerPhone}
                      {existingOrder.customerEmail ? ` · ${existingOrder.customerEmail}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Vehicle</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {existingOrder.vehicleYear} {existingOrder.vehicleMake}{' '}
                      {existingOrder.vehicleModel}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono">
                      <span>Plate: {existingOrder.licensePlate || 'N/A'}</span>
                      <span>VIN: {existingOrder.vin || 'N/A'}</span>
                      <label className="inline-flex items-center gap-1.5">
                        <span>Mileage:</span>
                        <input
                          type="number"
                          min={0}
                          disabled={isPaidOrVoided}
                          value={mileage}
                          onChange={(e) => setMileage(Number(e.target.value) || 0)}
                          className="w-24 px-2 py-1 border border-slate-200 rounded text-xs font-mono text-slate-900 bg-white disabled:bg-slate-50"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer Card */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">Customer</span>
                      {customers.length > 0 && (
                        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                          <button
                            type="button"
                            onClick={() => setCustomerMode('existing')}
                            className={`px-2 py-1 text-[11px] font-medium rounded ${
                              customerMode === 'existing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            Existing
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerMode('new');
                              setVehicleMode('new');
                            }}
                            className={`px-2 py-1 text-[11px] font-medium rounded ${
                              customerMode === 'new' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            New Customer
                          </button>
                        </div>
                      )}
                    </div>

                    {customerMode === 'existing' ? (
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg bg-white min-h-[42px]"
                      >
                        <option value="">Select a customer…</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          required
                          placeholder="Full name *"
                          value={newCustomerName}
                          onChange={(e) => setNewCustomerName(e.target.value)}
                          className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="tel"
                          required
                          placeholder="Phone number *"
                          value={newCustomerPhone}
                          onChange={(e) => setNewCustomerPhone(e.target.value)}
                          className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="email"
                          placeholder="Email address (for receipts)"
                          value={newCustomerEmail}
                          onChange={(e) => setNewCustomerEmail(e.target.value)}
                          className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                        />
                      </div>
                    )}
                  </div>

                  {/* Vehicle Card */}
                  <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">Vehicle</span>
                      {customerMode === 'existing' && customerVehicles.length > 0 && (
                        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                          <button
                            type="button"
                            onClick={() => setVehicleMode('existing')}
                            className={`px-2 py-1 text-[11px] font-medium rounded ${
                              vehicleMode === 'existing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            Existing
                          </button>
                          <button
                            type="button"
                            onClick={() => setVehicleMode('new')}
                            className={`px-2 py-1 text-[11px] font-medium rounded ${
                              vehicleMode === 'new' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                            }`}
                          >
                            New Vehicle
                          </button>
                        </div>
                      )}
                    </div>

                    {customerMode === 'existing' && vehicleMode === 'existing' && customerVehicles.length > 0 ? (
                      <div className="space-y-2.5">
                        <select
                          value={selectedVehicleId}
                          onChange={(e) => {
                            const vid = e.target.value;
                            setSelectedVehicleId(vid);
                            const v = customerVehicles.find((item) => item.id === vid);
                            if (v) setMileage(v.mileage);
                          }}
                          className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg bg-white min-h-[42px]"
                        >
                          {customerVehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.year} {v.make} {v.model} ({v.licensePlate || v.vin || 'No plate'})
                            </option>
                          ))}
                        </select>
                        <label className="block text-xs text-slate-600">
                          Current Mileage
                          <input
                            type="number"
                            min={0}
                            value={mileage}
                            onChange={(e) => setMileage(Number(e.target.value) || 0)}
                            className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <input
                          type="number"
                          required
                          min={1900}
                          max={2100}
                          placeholder="Year *"
                          value={newYear || ''}
                          onChange={(e) => setNewYear(e.target.value === '' ? 0 : Number(e.target.value))}
                          className="px-2.5 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Make *"
                          value={newMake}
                          onChange={(e) => setNewMake(e.target.value)}
                          className="px-2.5 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Model *"
                          value={newModel}
                          onChange={(e) => setNewModel(e.target.value)}
                          className="col-span-2 sm:col-span-1 px-2.5 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          placeholder="License Plate"
                          value={newPlate}
                          onChange={(e) => setNewPlate(e.target.value)}
                          className="px-2.5 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono uppercase"
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="Mileage"
                          value={newMileage || ''}
                          onChange={(e) => setNewMileage(Number(e.target.value) || 0)}
                          className="px-2.5 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono sm:order-last"
                        />
                        <input
                          type="text"
                          placeholder="VIN"
                          value={newVin}
                          onChange={(e) => setNewVin(e.target.value)}
                          className="col-span-2 sm:col-span-1 px-2.5 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono uppercase"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Work Status */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Work Status
                </label>
                {isPaidOrVoided ? (
                  <div className="px-3 py-2 text-sm font-medium bg-slate-100 rounded-lg text-slate-700">
                    {WORK_ORDER_STATUS_LABELS[existingOrder!.status]} (Locked)
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {ACTIVE_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatus(st)}
                        className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors min-h-[44px] ${
                          status === st
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {WORK_ORDER_STATUS_LABELS[st]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Service Catalog Quick-Add */}
              {!isPaidOrVoided && (
                <div className="border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900">
                        Add Services &amp; Tires from Price List
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {isManagerView
                          ? 'Click to add catalog items or add custom parts below.'
                          : 'Click to add services. Catalog prices are locked by management.'}
                      </p>
                    </div>
                    <input
                      type="search"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      placeholder="Filter services…"
                      className="px-3 py-2 sm:py-1.5 text-base sm:text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white sm:w-52"
                    />
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
                    {(['all', 'tire_repair', 'tire_sale', 'oil_change', 'tune_up', 'part'] as const).map(
                      (cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCatalogCategory(cat)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                            catalogCategory === cat
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {cat === 'all' ? 'All' : SERVICE_CATEGORY_LABELS[cat]}
                        </button>
                      )
                    )}
                  </div>

                  {activeCatalogServices.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">
                      No matching services in the catalog. Management can add services in Price List.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {activeCatalogServices.map((svc) => (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => addCatalogItem(svc)}
                          className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 min-h-[44px]"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-900 truncate">{svc.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {SERVICE_CATEGORY_LABELS[svc.category]}
                            </p>
                          </div>
                          <span className="text-xs font-semibold font-mono tabular-nums text-slate-900 shrink-0">
                            {formatCurrency(svc.unitPrice)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {isManagerView && (
                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                      <input
                        type="text"
                        placeholder="Custom part / tire description"
                        value={customPartName}
                        onChange={(e) => setCustomPartName(e.target.value)}
                        className="w-full sm:flex-1 sm:min-w-[180px] px-2.5 py-2 sm:py-1.5 text-base sm:text-xs border border-slate-200 rounded-lg"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={customPartQty}
                          onChange={(e) => setCustomPartQty(Number(e.target.value) || 1)}
                          className="w-16 px-2.5 py-2 sm:py-1.5 text-base sm:text-xs border border-slate-200 rounded-lg font-mono"
                          aria-label="Custom item quantity"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Unit $"
                          value={customPartPrice}
                          onChange={(e) => setCustomPartPrice(e.target.value)}
                          className="flex-1 sm:w-24 sm:flex-none px-2.5 py-2 sm:py-1.5 text-base sm:text-xs border border-slate-200 rounded-lg font-mono"
                        />
                        <button
                          type="button"
                          onClick={addCustomPartItem}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-800 min-h-[40px] sm:min-h-0 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Part
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Line Items & Iowa Tax Totals */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Line Items ({lineItems.length})
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    Iowa Sales Tax: {(Number(taxRate) || 0).toFixed(2)}%
                  </span>
                </div>

                {lineItems.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No services or parts added yet. Click any service above to add it.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {lineItems.map((item) => (
                      <div
                        key={item.id}
                        className="px-3.5 sm:px-4 py-3 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {SERVICE_CATEGORY_LABELS[item.category]} ·{' '}
                            {item.taxable ? 'Taxable' : 'Non-taxable'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto shrink-0">
                          <label className="text-[11px] text-slate-500 flex items-center gap-1">
                            Qty
                            <input
                              type="number"
                              min={1}
                              max={99}
                              disabled={isPaidOrVoided}
                              value={item.qty}
                              onChange={(e) =>
                                updateLineQty(item.id, Number(e.target.value) || 1)
                              }
                              className="w-14 px-2 py-1 text-base sm:text-xs font-mono border border-slate-200 rounded bg-white disabled:bg-slate-50"
                            />
                          </label>

                          {isManagerView && !isPaidOrVoided ? (
                            <label className="text-[11px] text-slate-500 flex items-center gap-1">
                              $
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) =>
                                  updateLinePrice(item.id, Number(e.target.value))
                                }
                                className="w-20 px-2 py-1 text-base sm:text-xs font-mono border border-slate-200 rounded bg-white"
                              />
                            </label>
                          ) : (
                            <span className="text-xs font-mono tabular-nums text-slate-600 w-18 text-right">
                              {formatCurrency(item.unitPrice)}
                            </span>
                          )}

                          <span className="text-xs sm:text-sm font-semibold font-mono tabular-nums text-slate-900 w-20 text-right">
                            {formatCurrency(item.qty * item.unitPrice)}
                          </span>

                          {!isPaidOrVoided && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(item.id)}
                              className="p-2 text-slate-400 hover:text-red-600 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
                              aria-label="Remove line item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Totals Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col items-end space-y-1.5 text-xs">
                  <div className="flex items-center justify-between w-full max-w-xs text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatCurrency(totals.subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between w-full max-w-xs text-slate-600">
                    <span>Discount</span>
                    {isManagerView && !isPaidOrVoided ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={discount}
                        onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-24 px-2 py-1 text-right text-base sm:text-xs font-mono border border-slate-200 rounded bg-white"
                      />
                    ) : (
                      <span className="font-mono tabular-nums text-slate-900">
                        -{formatCurrency(totals.discount)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between w-full max-w-xs text-slate-600">
                    <span>Iowa Sales Tax ({(Number(taxRate) || 0).toFixed(2)}%)</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatCurrency(totals.taxAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between w-full max-w-xs pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                    <span>Total</span>
                    <span className="font-mono tabular-nums">{formatCurrency(totals.total)}</span>
                  </div>

                  {!isManagerView && (
                    <p className="inline-flex items-center gap-1 text-[11px] text-slate-500 pt-1">
                      <Lock className="h-3 w-3" />
                      Prices, discounts &amp; tax rates are locked by management
                    </p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Technician / Shop Notes
                </label>
                <textarea
                  rows={2}
                  disabled={isPaidOrVoided}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Tire tread depth, torque spec, oil weight, customer concerns…"
                  className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
                />
              </div>
            </form>
          )}

          {/* Management: Mark Paid Inline Drawer */}
          {showPayPanel && existingOrder && isManagerView && !isPaidOrVoided && (
            <div className="border border-slate-300 bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  Collect Payment &amp; Close Work Order
                </h4>
                <button
                  type="button"
                  onClick={() => setShowPayPanel(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs font-medium text-slate-600 mb-1">Method</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['card', 'cash'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayMethod(m)}
                        className={`py-2 text-xs font-medium rounded-lg border uppercase min-h-[40px] ${
                          payMethod === m
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Amount Paid ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full px-3 py-2 text-base sm:text-sm font-mono border border-slate-200 rounded-lg bg-white min-h-[44px] sm:min-h-[40px]"
                  />
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Once marked Paid, line items and totals are locked. Paid orders can only be voided
                by management with a reason note.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={handleMarkPaid}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 min-h-[44px] sm:min-h-[40px]"
              >
                {saving ? 'Recording Payment…' : 'Confirm Payment & Generate Receipt'}
              </button>
            </div>
          )}

          {/* Management: Void Paid Order Drawer */}
          {showVoidPanel && existingOrder?.status === 'paid' && isManagerView && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-red-900">Void Paid Work Order</h4>
                <button
                  type="button"
                  onClick={() => setShowVoidPanel(false)}
                  className="text-xs text-red-700"
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                placeholder="Required void reason (e.g., Duplicate ticket / Refunded to card)..."
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-red-200 rounded-lg bg-white"
              />
              <button
                type="button"
                disabled={saving}
                onClick={handleVoidOrder}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 min-h-[44px] sm:min-h-[40px]"
              >
                {saving ? 'Voiding…' : 'Confirm Void'}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {errorMsg && (
          <div className="no-print px-5 py-2.5 border-t border-red-200 bg-red-50 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        <div className="no-print px-4 sm:px-5 py-3 sm:py-3.5 pb-safe border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2">
            {existingOrder?.status === 'paid' && isManagerView && !showVoidPanel && (
              <button
                type="button"
                onClick={() => setShowVoidPanel(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 min-h-[44px] sm:min-h-[40px]"
              >
                <Ban className="h-3.5 w-3.5" />
                Void Paid Order
              </button>
            )}
            {existingOrder && !isPaidOrVoided && isManagerView && !showPayPanel && (
              <button
                type="button"
                onClick={() => {
                  setPayAmount(totals.total.toFixed(2));
                  setShowPayPanel(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 sm:px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 min-h-[44px] sm:min-h-[40px]"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Mark Paid
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-3.5 sm:px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[44px] sm:min-h-[40px]"
            >
              {isPaidOrVoided ? 'Close' : 'Cancel'}
            </button>
            {!isPaidOrVoided && activeTab === 'order' && (
              <button
                type="submit"
                form="work-order-form"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 sm:px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors min-h-[44px] sm:min-h-[40px]"
              >
                {saving ? 'Saving…' : existingOrder ? 'Save Changes' : 'Create Work Order'}
              </button>
            )}
          </div>
        </div>

        {/* Print-only Receipt Layout (optimized by @media print in index.css) */}
        <article className="print-receipt-sheet" aria-label="Printable Receipt">
          <div className="print-receipt-header">
            <div>
              <BrandLogo size="print" className="print-receipt-logo" />
              {company?.shopName &&
                company.shopName.trim().toLowerCase() !== DEFAULT_SHOP_NAME.toLowerCase() && (
                  <h1 className="print-receipt-shop-name">{company.shopName}</h1>
                )}
              {shopAddressLine && (
                <p className="print-receipt-shop-meta">{shopAddressLine}</p>
              )}
              {shopContactLine && (
                <p className="print-receipt-shop-meta">{shopContactLine}</p>
              )}
            </div>
            <div>
              <p
                className={`print-receipt-status ${
                  existingOrder?.status === 'voided' ? 'is-voided' : ''
                }`}
              >
                {existingOrder?.status === 'paid'
                  ? 'RECEIPT · PAID'
                  : existingOrder?.status === 'voided'
                  ? 'RECEIPT · VOIDED'
                  : `WORK ORDER · ${WORK_ORDER_STATUS_LABELS[existingOrder?.status || status].toUpperCase()}`}
              </p>
              <p className="print-receipt-order-meta">
                {existingOrder ? existingOrder.orderNumber : 'DRAFT WORK ORDER'}
              </p>
              <p className="print-receipt-date">
                {existingOrder?.paidAt
                  ? new Date(existingOrder.paidAt).toLocaleString()
                  : existingOrder
                  ? formatTimestamp(existingOrder.createdAt)
                  : new Date().toLocaleString()}
              </p>
            </div>
          </div>

          <div className="print-receipt-parties">
            <div>
              <p className="print-receipt-section-label">Customer</p>
              <p className="print-receipt-party-name">{printCustomerName}</p>
              {printCustomerPhone && (
                <p className="print-receipt-party-detail">Phone: {printCustomerPhone}</p>
              )}
              {printCustomerEmail && (
                <p className="print-receipt-party-detail">Email: {printCustomerEmail}</p>
              )}
            </div>
            <div>
              <p className="print-receipt-section-label">Vehicle</p>
              <p className="print-receipt-party-name">{printVehicleTitle}</p>
              <p className="print-receipt-party-detail">
                Plate: {printPlate} · Mileage: {Number(printMileage || 0).toLocaleString()} mi
              </p>
              {printVin && (
                <p className="print-receipt-party-detail">VIN: {printVin}</p>
              )}
            </div>
          </div>

          <table className="print-receipt-table">
            <thead>
              <tr>
                <th>Service / Part</th>
                <th className="is-num">Qty</th>
                <th className="is-num">Unit</th>
                <th className="is-num">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={4}>No line items recorded.</td>
                </tr>
              ) : (
                lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.name}
                      {!item.taxable ? ' (Non-tax)' : ''}
                    </td>
                    <td className="is-num">{item.qty}</td>
                    <td className="is-num">{formatCurrency(item.unitPrice)}</td>
                    <td className="is-num">
                      {formatCurrency(item.qty * item.unitPrice)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="print-receipt-totals-wrap">
            <div className="print-receipt-totals">
              <div className="print-receipt-total-row">
                <span>Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="print-receipt-total-row">
                  <span>Discount</span>
                  <span>-{formatCurrency(totals.discount)}</span>
                </div>
              )}
              <div className="print-receipt-total-row">
                <span>Iowa Sales Tax ({(Number(taxRate) || 0).toFixed(2)}%)</span>
                <span>{formatCurrency(totals.taxAmount)}</span>
              </div>
              <div className="print-receipt-grand-total">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>

              {(existingOrder?.status === 'paid' || existingOrder?.status === 'voided') && (
                <div className="print-receipt-payment-meta">
                  <div className="print-receipt-total-row">
                    <span>
                      Payment ({existingOrder.paymentMethod === 'cash' ? 'Cash' : existingOrder.paymentMethod === 'card' ? 'Card' : 'N/A'})
                    </span>
                    <span>{formatCurrency(existingOrder.amountPaid)}</span>
                  </div>
                  {existingOrder.paidAt && (
                    <p className="print-receipt-paid-date">
                      Paid Date: {new Date(existingOrder.paidAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {existingOrder?.status === 'voided' && (
            <div className="print-receipt-void-box">
              <strong>THIS RECEIPT HAS BEEN VOIDED</strong>
              <div>
                Reason: {existingOrder.voidReason || 'Voided by management'} (by{' '}
                {existingOrder.voidedByName || 'Management'})
              </div>
            </div>
          )}

          {notes && (
            <div className="print-receipt-notes">
              <p className="print-receipt-section-label">Technician / Work Order Notes</p>
              <p className="print-receipt-notes-body">{notes}</p>
            </div>
          )}

          <footer className="print-receipt-footer">
            {company?.receiptFooter ||
              'Thank you for your business. Torque lug nuts after 50 miles.'}
          </footer>
        </article>
      </div>
    </div>
  );
};
