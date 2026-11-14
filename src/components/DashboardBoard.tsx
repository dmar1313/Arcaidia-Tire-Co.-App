import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  PackageOpen,
  Phone,
  Plus,
  Search,
  Wrench,
  XCircle,
} from 'lucide-react';
import { COMPANY_LOGO_SRC } from './BrandLogo';
import { formatCurrency, isSameLocalDay } from '../lib/calculations';
import { formatAppError } from '../lib/firebase';
import {
  WORK_ORDER_STATUS_LABELS,
  type StaffRole,
  type WorkOrder,
  type WorkOrderStatus,
} from '../types';

interface DashboardBoardProps {
  workOrders: WorkOrder[];
  effectiveRole: StaffRole;
  onSelectOrder: (wo: WorkOrder) => void;
  onCreateOrder: () => void;
  onQuickStatus: (wo: WorkOrder, nextStatus: WorkOrderStatus) => Promise<void>;
  compactMode?: boolean;
}

type FilterTab = 'active' | 'all' | WorkOrderStatus;

const STATUS_FILTERS: { id: FilterTab; label: string }[] = [
  { id: 'active', label: 'Active Board' },
  { id: 'intake', label: 'Intake' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'waiting_on_parts', label: 'Waiting on Parts' },
  { id: 'ready', label: 'Ready' },
  { id: 'paid', label: 'Paid' },
  { id: 'voided', label: 'Voided' },
  { id: 'all', label: 'All' },
];

export function StatusText({ status }: { status: WorkOrderStatus }) {
  const styles: Record<WorkOrderStatus, { color: string; icon: React.ReactNode }> = {
    intake: { color: 'text-neutral-700', icon: <Clock className="h-3.5 w-3.5 text-neutral-500" /> },
    in_progress: {
      color: 'text-[#C81E2B]',
      icon: <Wrench className="h-3.5 w-3.5 text-[#C81E2B]" />,
    },
    waiting_on_parts: {
      color: 'text-amber-700',
      icon: <PackageOpen className="h-3.5 w-3.5 text-amber-600" />,
    },
    ready: {
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
    },
    paid: {
      color: 'text-neutral-900',
      icon: <FileText className="h-3.5 w-3.5 text-neutral-700" />,
    },
    voided: {
      color: 'text-red-700',
      icon: <XCircle className="h-3.5 w-3.5 text-red-600" />,
    },
  };
  const cfg = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${cfg.color}`}>
      {cfg.icon}
      {WORK_ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export const DashboardBoard: React.FC<DashboardBoardProps> = ({
  workOrders,
  effectiveRole,
  onSelectOrder,
  onCreateOrder,
  onQuickStatus,
  compactMode = false,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [watermarkFailed, setWatermarkFailed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const isMechanic = effectiveRole === 'mechanic';

  // Press '/' anywhere outside inputs to jump to search on desktop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const metrics = useMemo(() => {
    const todaysJobs = workOrders.filter(
      (wo) => wo.status !== 'voided' && isSameLocalDay(wo.createdAt)
    ).length;
    const paidToday = workOrders.filter(
      (wo) => wo.status === 'paid' && isSameLocalDay(wo.createdAt)
    ).length;
    const inBayCount = workOrders.filter((wo) => wo.status === 'in_progress').length;
    const partsHoldCount = workOrders.filter((wo) => wo.status === 'waiting_on_parts').length;
    const inProgress = inBayCount + partsHoldCount;
    const readyNotPaid = workOrders.filter((wo) => wo.status === 'ready').length;
    const unpaidActive = workOrders.filter(
      (wo) =>
        wo.status === 'intake' ||
        wo.status === 'in_progress' ||
        wo.status === 'waiting_on_parts' ||
        wo.status === 'ready'
    );
    const unpaidTotal = unpaidActive.reduce((sum, wo) => sum + (wo.total || 0), 0);

    const countsByTab: Record<FilterTab, number> = {
      active: unpaidActive.length,
      intake: workOrders.filter((w) => w.status === 'intake').length,
      in_progress: inBayCount,
      waiting_on_parts: partsHoldCount,
      ready: readyNotPaid,
      paid: workOrders.filter((w) => w.status === 'paid').length,
      voided: workOrders.filter((w) => w.status === 'voided').length,
      all: workOrders.length,
    };

    return {
      todaysJobs,
      paidToday,
      inProgress,
      inBayCount,
      partsHoldCount,
      readyNotPaid,
      unpaidTotal,
      countsByTab,
    };
  }, [workOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (filter === 'active') {
        if (wo.status === 'paid' || wo.status === 'voided') return false;
      } else if (filter !== 'all' && wo.status !== filter) {
        return false;
      }

      if (!q) return true;
      const hay = [
        wo.orderNumber,
        wo.customerName,
        wo.customerPhone,
        wo.licensePlate,
        wo.vin,
        `${wo.vehicleYear} ${wo.vehicleMake} ${wo.vehicleModel}`,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [workOrders, filter, search]);

  const selectedOrder = useMemo(() => {
    if (filteredOrders.length === 0) return null;
    if (selectedId) {
      const match = filteredOrders.find((wo) => wo.id === selectedId);
      if (match) return match;
    }
    return filteredOrders[0];
  }, [filteredOrders, selectedId]);

  const handleQuickAction = async (
    e: React.MouseEvent,
    wo: WorkOrder,
    nextStatus: WorkOrderStatus
  ) => {
    e.stopPropagation();
    setBusyId(wo.id);
    setQuickError(null);
    try {
      await onQuickStatus(wo, nextStatus);
    } catch (err) {
      setQuickError(formatAppError(err, 'Unable to update work order status.'));
    } finally {
      setBusyId(null);
    }
  };

  const getCardAccentClass = (status: WorkOrderStatus) => {
    switch (status) {
      case 'in_progress':
        return 'border-l-4 border-l-[#C81E2B]';
      case 'waiting_on_parts':
        return 'border-l-4 border-l-amber-500';
      case 'ready':
        return 'border-l-4 border-l-emerald-600';
      case 'intake':
        return 'border-l-4 border-l-[#111111]';
      case 'paid':
        return 'border-l-4 border-l-neutral-300';
      case 'voided':
        return 'border-l-4 border-l-red-300 opacity-75';
    }
  };

  const activeFilterLabel =
    STATUS_FILTERS.find((t) => t.id === filter)?.label || 'Work Orders';

  const formatLinePreview = (wo: WorkOrder) => {
    const items = wo.lineItems || [];
    if (items.length === 0) return 'No line items yet';
    const base = items
      .slice(0, 2)
      .map((li) => (li.qty > 1 ? `${li.qty}× ${li.name}` : li.name))
      .join(' · ');
    const extra = Math.max(0, items.length - 2);
    return extra > 0 ? `${base} +${extra} more` : base;
  };

  return (
    <div className="relative space-y-5">
      {!watermarkFailed && (
        <div
          aria-hidden="true"
          className="pointer-events-none select-none fixed inset-0 md:left-60 flex items-center justify-center overflow-hidden z-0 print:hidden"
        >
          <img
            src={COMPANY_LOGO_SRC}
            alt=""
            onError={() => setWatermarkFailed(true)}
            className="w-[360px] sm:w-[500px] lg:w-[640px] max-w-[85vw] aspect-[2/1] object-cover object-[50%_52%] opacity-[0.12] mix-blend-multiply"
          />
        </div>
      )}

      <div className="relative z-10 space-y-4 sm:space-y-5">
        {quickError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            {quickError}
          </div>
        )}

        {/* Top-Accented KPI Strip — Arcadia Classic Alternating Black & Crimson */}
        {!compactMode && (
          isMechanic ? (
            <section aria-label="Mechanic Bay Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#111111] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  Today’s Jobs
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111111] font-mono tabular-nums">
                  {metrics.todaysJobs}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Logged today
                </p>
              </div>
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#C81E2B] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  In Progress
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#C81E2B] font-mono tabular-nums">
                  {metrics.inBayCount}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Currently on lift
                </p>
              </div>
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#111111] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  Waiting on Parts
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-amber-600 font-mono tabular-nums">
                  {metrics.partsHoldCount}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Parts hold
                </p>
              </div>
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#C81E2B] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  Ready for Counter
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-emerald-700 font-mono tabular-nums">
                  {metrics.readyNotPaid}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Awaiting pickup
                </p>
              </div>
            </section>
          ) : (
            <section aria-label="Today's Shop Summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#111111] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  Today’s Jobs
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111111] font-mono tabular-nums">
                  {metrics.todaysJobs}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  {metrics.countsByTab.active} active · {metrics.paidToday} paid today
                </p>
              </div>
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#C81E2B] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  In Bay / Parts Hold
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#C81E2B] font-mono tabular-nums">
                  {metrics.inProgress}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Cars taking up a bay or waiting
                </p>
              </div>
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#111111] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  Ready · Not Paid
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111111] font-mono tabular-nums">
                  {metrics.readyNotPaid}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Done — waiting on pickup &amp; payment
                </p>
              </div>
              <div className="bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] border-t-[3px] border-t-[#C81E2B] rounded-xl p-3 sm:p-4">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-neutral-500">
                  Unpaid Total
                </p>
                <p className="mt-1 sm:mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-[#111111] font-mono tabular-nums truncate">
                  {formatCurrency(metrics.unpaidTotal)}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500 hidden sm:block">
                  Open balance across the board
                </p>
              </div>
            </section>
          )
        )}

        {/* Unified Search & Filter Toolbar */}
        <section className="bg-white/80 backdrop-blur-[1.5px] border border-[#E5E3DC] rounded-xl p-3 sm:p-4 space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, plate, VIN, or WO#..."
              className="w-full pl-9 sm:pr-24 pr-3 py-2 text-base sm:text-sm bg-[#F7F6F2] border border-[#E5E3DC] rounded-lg text-[#111111] placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-neutral-400 min-h-[42px]"
            />
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded border border-[#E5E3DC] bg-white text-[11px] font-mono text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              / to search
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x">
            {STATUS_FILTERS.filter((tab) =>
              isMechanic ? tab.id !== 'voided' : true
            ).map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`snap-start inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                    active
                      ? 'bg-[#111111] text-white border-[#111111]'
                      : 'bg-white text-neutral-700 border-[#E5E3DC] hover:border-neutral-400'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-neutral-300' : 'text-neutral-400'
                    }`}
                  >
                    {metrics.countsByTab[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Empty State */}
        {filteredOrders.length === 0 ? (
          <section className="bg-white/70 backdrop-blur-[1.5px] border border-[#E5E3DC] rounded-xl min-h-[260px] flex flex-col items-center justify-center py-12 px-6 text-center">
            <p className="text-sm font-semibold text-[#111111]">
              {workOrders.length === 0
                ? 'No work orders yet'
                : 'No matching work orders for this filter'}
            </p>
            <p className="mt-1 text-xs text-neutral-600 max-w-md">
              {workOrders.length === 0
                ? 'Create your first work order to log a tire repair, tire sale, oil change, or tune-up.'
                : 'Try clearing the search query or switching to All work orders.'}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={onCreateOrder}
                className="inline-flex items-center gap-2 rounded-lg bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 transition-colors min-h-[40px]"
              >
                <Plus className="h-3.5 w-3.5" />
                New Work Order
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Desktop Split-Pane Classic Table + Job Detail Inspector */}
            <div className="hidden lg:grid lg:grid-cols-12 lg:gap-4 items-start">
              <section className="lg:col-span-8 bg-white/75 backdrop-blur-[1.5px] border border-[#E5E3DC] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#E5E3DC] flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold tracking-wide uppercase text-[#111111]">
                      {activeFilterLabel}
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {filteredOrders.length} job{filteredOrders.length === 1 ? '' : 's'}
                      {filter === 'active' ? ' · paid and voided are hidden' : ''}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-neutral-500">
                    Click row to inspect · Double-click to edit
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E5E3DC] bg-[#FAF9F6]/75 text-[10px] font-semibold tracking-wider uppercase text-neutral-500">
                        <th className="py-2.5 pl-4 pr-2 w-24">WO #</th>
                        <th className="py-2.5 px-2">Customer / Vehicle</th>
                        <th className="py-2.5 px-2">Service / Opened By</th>
                        <th className="py-2.5 px-2">Status</th>
                        <th className="py-2.5 pl-2 pr-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EFEA]">
                      {filteredOrders.map((wo) => {
                        const isSelected = selectedOrder?.id === wo.id;
                        const itemsList = wo.lineItems || [];
                        return (
                          <tr
                            key={wo.id}
                            onClick={() => setSelectedId(wo.id)}
                            onDoubleClick={() => onSelectOrder(wo)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#FDF2F2]/85 border-l-[3px] border-l-[#C81E2B]'
                                : 'hover:bg-white/80 border-l-[3px] border-l-transparent'
                            }`}
                          >
                            <td className="py-3 pl-3.5 pr-2 font-mono text-xs font-semibold whitespace-nowrap align-top">
                              <span className={isSelected ? 'text-[#C81E2B]' : 'text-neutral-600'}>
                                {wo.orderNumber}
                              </span>
                            </td>
                            <td className="py-3 px-2 align-top max-w-[210px]">
                              <p className="text-xs font-bold text-[#111111] truncate">
                                {wo.customerName}
                              </p>
                              <p className="text-[11px] text-neutral-600 truncate mt-0.5">
                                {wo.vehicleYear} {wo.vehicleMake} {wo.vehicleModel}
                                {wo.licensePlate ? ` · ${wo.licensePlate}` : ''}
                              </p>
                              {wo.customerPhone && (
                                <p className="text-[11px] text-neutral-400 font-mono tabular-nums mt-0.5">
                                  {wo.customerPhone}
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-2 align-top max-w-[220px]">
                              <p className="text-xs font-medium text-[#111111] truncate">
                                {formatLinePreview(wo)}
                              </p>
                              <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                                {wo.createdByName || 'Shop'}
                                {wo.hasPendingWrites ? ' · Saved offline' : ''}
                              </p>
                            </td>
                            <td className="py-3 px-2 align-top whitespace-nowrap">
                              <StatusText status={wo.status} />
                            </td>
                            <td className="py-3 pl-2 pr-4 align-top text-right whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums text-[#111111]">
                                {isMechanic
                                  ? `${itemsList.length} item${itemsList.length === 1 ? '' : 's'}`
                                  : formatCurrency(wo.total)}
                                <ChevronRight
                                  className={`h-3.5 w-3.5 ${
                                    isSelected ? 'text-[#C81E2B]' : 'text-neutral-300'
                                  }`}
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Right-Side Job Detail Inspector */}
              {selectedOrder && (
                <aside className="lg:col-span-4 bg-white/80 backdrop-blur-[1.5px] border border-[#E5E3DC] rounded-xl p-4 space-y-4 sticky top-20">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-[#C81E2B]">
                        Job Detail
                      </p>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#111111]">
                          {selectedOrder.orderNumber}
                        </span>
                        <span className="text-neutral-300" aria-hidden="true">
                          ·
                        </span>
                        <StatusText status={selectedOrder.status} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[#111111] leading-snug">
                      {selectedOrder.customerName}
                    </h3>
                    <p className="text-xs text-neutral-600 mt-0.5">
                      {selectedOrder.vehicleYear} {selectedOrder.vehicleMake}{' '}
                      {selectedOrder.vehicleModel}
                      {selectedOrder.licensePlate ? ` · ${selectedOrder.licensePlate}` : ''}
                    </p>
                  </div>

                  <dl className="divide-y divide-[#F0EFEA] border-t border-b border-[#F0EFEA] text-xs">
                    <div className="py-2 flex items-center justify-between gap-3">
                      <dt className="text-neutral-500">Phone</dt>
                      <dd className="font-mono tabular-nums font-medium text-[#111111]">
                        {selectedOrder.customerPhone || '—'}
                      </dd>
                    </div>
                    <div className="py-2 flex items-start justify-between gap-3">
                      <dt className="text-neutral-500 shrink-0">Service</dt>
                      <dd className="font-medium text-[#111111] text-right">
                        {formatLinePreview(selectedOrder)}
                      </dd>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-3">
                      <dt className="text-neutral-500">Mileage</dt>
                      <dd className="font-mono tabular-nums text-[#111111]">
                        {(selectedOrder.mileage ?? 0).toLocaleString()} mi
                      </dd>
                    </div>
                    <div className="py-2 flex items-center justify-between gap-3">
                      <dt className="text-neutral-500">Opened By</dt>
                      <dd className="font-medium text-[#111111]">
                        {selectedOrder.createdByName || 'Shop'}
                      </dd>
                    </div>
                    {!isMechanic && (
                      <div className="py-2 flex items-center justify-between gap-3">
                        <dt className="text-neutral-500">Total</dt>
                        <dd className="font-mono tabular-nums font-bold text-[#111111]">
                          {formatCurrency(selectedOrder.total)}
                        </dd>
                      </div>
                    )}
                    <div className="py-2 flex items-center justify-between gap-3">
                      <dt className="text-neutral-500">Status</dt>
                      <dd className="font-medium text-[#111111]">
                        {selectedOrder.status === 'paid'
                          ? `Paid (${selectedOrder.paymentMethod || 'Counter'})`
                          : selectedOrder.status === 'voided'
                          ? 'Voided'
                          : isMechanic
                          ? `${(selectedOrder.lineItems || []).length} item(s)`
                          : `${formatCurrency(selectedOrder.total)} · Unpaid`}
                      </dd>
                    </div>
                  </dl>

                  {selectedOrder.notes && (
                    <div className="bg-[#FAF9F6] border border-[#E5E3DC] rounded-lg px-3 py-2 text-xs text-neutral-700">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                        Notes
                      </p>
                      <p className="line-clamp-3">{selectedOrder.notes}</p>
                    </div>
                  )}

                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      {selectedOrder.status === 'intake' && (
                        <button
                          type="button"
                          disabled={busyId === selectedOrder.id}
                          onClick={(e) => handleQuickAction(e, selectedOrder, 'in_progress')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C81E2B] hover:bg-[#A61722] text-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors min-h-[40px]"
                        >
                          Start Job
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(selectedOrder.status === 'in_progress' ||
                        selectedOrder.status === 'waiting_on_parts') && (
                        <button
                          type="button"
                          disabled={busyId === selectedOrder.id}
                          onClick={(e) => handleQuickAction(e, selectedOrder, 'ready')}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C81E2B] hover:bg-[#A61722] text-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors min-h-[40px]"
                        >
                          Move to Ready
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(selectedOrder.status === 'ready' ||
                        selectedOrder.status === 'paid' ||
                        selectedOrder.status === 'voided') && (
                        <button
                          type="button"
                          onClick={() => onSelectOrder(selectedOrder)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C81E2B] hover:bg-[#A61722] text-white px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors min-h-[40px]"
                        >
                          {selectedOrder.status === 'ready' && !isMechanic
                            ? 'Collect / Pay'
                            : 'Open Order'}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {selectedOrder.customerPhone ? (
                        <a
                          href={`tel:${selectedOrder.customerPhone}`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E5E3DC] bg-white hover:bg-[#FAF9F6] text-[#111111] px-3 py-2.5 text-xs font-semibold transition-colors min-h-[40px]"
                        >
                          <Phone className="h-3.5 w-3.5 text-neutral-500" />
                          Call Customer
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectOrder(selectedOrder)}
                          className="inline-flex items-center justify-center rounded-lg border border-[#E5E3DC] bg-white hover:bg-[#FAF9F6] text-[#111111] px-3 py-2.5 text-xs font-semibold transition-colors min-h-[40px]"
                        >
                          Open Full Order
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedOrder.status === 'in_progress' && (
                        <button
                          type="button"
                          disabled={busyId === selectedOrder.id}
                          onClick={(e) => handleQuickAction(e, selectedOrder, 'waiting_on_parts')}
                          className="flex-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-2 text-xs font-medium transition-colors"
                        >
                          Put on Parts Hold
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectOrder(selectedOrder)}
                        className="flex-1 rounded-lg border border-[#E5E3DC] bg-[#FAF9F6] hover:bg-neutral-100 text-[#111111] px-3 py-2 text-xs font-semibold transition-colors"
                      >
                        Edit Items &amp; Receipt
                      </button>
                    </div>
                  </div>
                </aside>
              )}
            </div>

            {/* Mobile & Tablet Card Stack (Preserves thumb-friendly phone layout) */}
            <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredOrders.map((wo) => {
                const itemsList = wo.lineItems || [];
                const previewServices = itemsList
                  .slice(0, 2)
                  .map((li) => (li.qty > 1 ? `${li.qty}× ${li.name}` : li.name))
                  .join(' · ');
                const extraCount = Math.max(0, itemsList.length - 2);

                return (
                  <article
                    key={wo.id}
                    onClick={() => onSelectOrder(wo)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectOrder(wo);
                      }
                    }}
                    className={`bg-white/80 backdrop-blur-[1.5px] border border-[#E5E3DC] hover:border-neutral-400 hover:bg-white rounded-xl p-4 transition-colors cursor-pointer flex flex-col justify-between gap-3 ${getCardAccentClass(
                      wo.status
                    )}`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-mono text-xs font-bold text-[#111111]">
                            {wo.orderNumber}
                          </span>
                          <span className="text-neutral-300" aria-hidden="true">
                            ·
                          </span>
                          <StatusText status={wo.status} />
                          {wo.hasPendingWrites && (
                            <span className="text-[11px] font-medium text-amber-600">
                              · Saved offline
                            </span>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold font-mono tabular-nums text-[#111111]">
                            {isMechanic
                              ? `${itemsList.length} item${itemsList.length === 1 ? '' : 's'}`
                              : formatCurrency(wo.total)}
                          </p>
                          {wo.status === 'paid' && (
                            <p className="text-[10px] font-medium text-neutral-500 uppercase">
                              Paid · {wo.paymentMethod}
                            </p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-[#111111] leading-snug">
                          {wo.vehicleYear} {wo.vehicleMake} {wo.vehicleModel}
                        </h3>
                        <p className="mt-0.5 text-xs text-neutral-600">
                          <span className="font-medium text-[#111111]">{wo.customerName}</span>
                          {wo.customerPhone && (
                            <span className="font-mono tabular-nums text-neutral-500">
                              {' '}
                              · {wo.customerPhone}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] font-mono tabular-nums text-neutral-500">
                          {wo.licensePlate || 'No plate'} · {(wo.mileage ?? 0).toLocaleString()} mi
                        </p>
                      </div>

                      {previewServices && (
                        <p className="text-xs text-neutral-600 truncate">
                          {previewServices}
                          {extraCount > 0 ? ` +${extraCount} more` : ''}
                        </p>
                      )}
                    </div>

                    <div className="pt-2.5 border-t border-[#F0EFEA] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <span className="text-xs text-neutral-500 truncate">
                        Opened by <span className="font-medium text-neutral-800">{wo.createdByName || 'Shop'}</span>
                      </span>

                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        {wo.status === 'intake' && (
                          <button
                            type="button"
                            disabled={busyId === wo.id}
                            onClick={(e) => handleQuickAction(e, wo, 'in_progress')}
                            className="flex-1 sm:flex-initial justify-center inline-flex items-center px-3 py-2 sm:py-1.5 min-h-[44px] md:min-h-[38px] text-xs font-semibold rounded-lg border border-[#E5E3DC] bg-white text-[#111111] hover:bg-neutral-100 transition-colors"
                          >
                            Start Job
                          </button>
                        )}
                        {wo.status === 'in_progress' && (
                          <button
                            type="button"
                            disabled={busyId === wo.id}
                            onClick={(e) => handleQuickAction(e, wo, 'waiting_on_parts')}
                            className="flex-1 sm:flex-initial justify-center inline-flex items-center px-3 py-2 sm:py-1.5 min-h-[44px] md:min-h-[38px] text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                          >
                            Parts Hold
                          </button>
                        )}
                        {(wo.status === 'in_progress' || wo.status === 'waiting_on_parts') && (
                          <button
                            type="button"
                            disabled={busyId === wo.id}
                            onClick={(e) => handleQuickAction(e, wo, 'ready')}
                            className="flex-1 sm:flex-initial justify-center inline-flex items-center px-3 py-2 sm:py-1.5 min-h-[44px] md:min-h-[38px] text-xs font-semibold rounded-lg bg-[#C81E2B] text-white hover:bg-[#A61722] transition-colors"
                          >
                            Mark Ready
                          </button>
                        )}
                        {wo.status === 'ready' && (
                          <span className="text-xs font-medium text-emerald-700">
                            {isMechanic ? 'Awaiting Counter' : 'Open to Collect'}
                          </span>
                        )}
                        {(wo.status === 'paid' || wo.status === 'voided') && (
                          <span className="text-xs text-neutral-400">View Receipt</span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
