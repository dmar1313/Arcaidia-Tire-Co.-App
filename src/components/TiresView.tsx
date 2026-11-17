import React, { useMemo, useState } from 'react';
import { Edit2, Lock, Minus, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../lib/calculations';
import { formatAppError } from '../lib/firebase';
import {
  adjustTireQuantity,
  createTire,
  deleteTire,
  updateTire,
  type ActorInfo,
} from '../lib/shopService';
import type { StaffRole, TireCondition, TireInventoryItem } from '../types';

interface TiresViewProps {
  tires: TireInventoryItem[];
  effectiveRole: StaffRole;
  actor: ActorInfo;
}

const CONDITION_LABELS: Record<TireCondition, string> = {
  new: 'New',
  used: 'Used',
};

export const TiresView: React.FC<TiresViewProps> = ({ tires, effectiveRole, actor }) => {
  const isManager = effectiveRole === 'management';
  const canManageInventory = isManager || effectiveRole === 'mechanic';
  const [search, setSearch] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'all' | TireCondition>('all');
  const [editing, setEditing] = useState<TireInventoryItem | 'new' | null>(null);
  const [tireSize, setTireSize] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState<TireCondition>('used');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TireInventoryItem | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const openModal = (item: TireInventoryItem | 'new') => {
    if (!canManageInventory) return;
    setEditing(item);
    if (item === 'new') {
      setTireSize('');
      setBrand('');
      setCondition('used');
      setQuantity('');
      setCostPrice('');
      setBinLocation('');
      setNotes('');
      setActive(true);
    } else {
      setTireSize(item.tireSize || '');
      setBrand(item.brand || '');
      setCondition(item.condition || 'used');
      setQuantity(String(item.quantity ?? 0));
      setCostPrice(item.costPrice !== undefined ? String(item.costPrice) : '');
      setBinLocation(item.binLocation || '');
      setNotes(item.notes || '');
      setActive(item.active);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageInventory || !tireSize.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: Parameters<typeof createTire>[0] = {
        tireSize,
        brand,
        condition,
        quantity: Math.max(0, parseInt(quantity, 10) || 0),
        // No sale price on tires — the price lives on the Price List service
        // line. New tires save at 0; edits keep the stored value so the
        // Firestore isValidTire check (which requires unitPrice) still passes.
        unitPrice: editing && editing !== 'new' ? Math.max(0, editing.unitPrice ?? 0) : 0,
        active,
      };
      if (costPrice.trim() !== '') {
        payload.costPrice = Math.max(0, Number(costPrice) || 0);
      }
      if (binLocation.trim() !== '') {
        payload.binLocation = binLocation.trim();
      }
      if (notes.trim() !== '') {
        payload.notes = notes.trim();
      }

      if (editing === 'new') {
        await createTire(payload, actor);
      } else if (editing) {
        await updateTire(editing, payload, actor);
      }
      setEditing(null);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to save tire.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async (tire: TireInventoryItem, delta: number) => {
    if (!canManageInventory || adjustingId) return;
    setAdjustingId(tire.id);
    setErrorMsg(null);
    try {
      await adjustTireQuantity(tire, delta, actor);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to update stock count.'));
    } finally {
      setAdjustingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!canManageInventory || !deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteBlocked(false);
    setErrorMsg(null);
    try {
      await deleteTire(deleteTarget.id, actor);
      setDeleteTarget(null);
      setEditing(null);
    } catch (err) {
      // The guard error means this tire is on a work order: keep the dialog
      // open and offer deactivation instead of deleting.
      setDeleteBlocked(true);
      setErrorMsg(formatAppError(err, 'Unable to delete tire.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeactivateInstead = async () => {
    if (!canManageInventory || !deleteTarget || deactivating) return;
    setDeactivating(true);
    setErrorMsg(null);
    try {
      await updateTire(
        deleteTarget,
        {
          tireSize: deleteTarget.tireSize,
          brand: deleteTarget.brand || '',
          condition: deleteTarget.condition,
          quantity: deleteTarget.quantity,
          unitPrice: deleteTarget.unitPrice,
          costPrice: deleteTarget.costPrice,
          binLocation: deleteTarget.binLocation,
          notes: deleteTarget.notes,
          active: false,
        },
        actor
      );
      setDeleteTarget(null);
      setDeleteBlocked(false);
      setEditing(null);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to deactivate tire.'));
    } finally {
      setDeactivating(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tires
      .filter((t) => (conditionFilter === 'all' ? true : t.condition === conditionFilter))
      .filter((t) => {
        if (!q) return true;
        return `${t.tireSize} ${t.brand} ${t.binLocation || ''} ${t.notes || ''}`
          .toLowerCase()
          .includes(q);
      })
      .slice()
      .sort((a, b) => {
        const sizeCmp = (a.tireSize || '').localeCompare(b.tireSize || '');
        if (sizeCmp !== 0) return sizeCmp;
        return (a.brand || '').localeCompare(b.brand || '');
      });
  }, [tires, search, conditionFilter]);

  const totalInStock = useMemo(
    () => tires.reduce((sum, t) => sum + Math.max(0, t.quantity || 0), 0),
    [tires]
  );

  const stockBadge = (qty: number) => (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        qty > 0
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}
    >
      {qty > 0 ? `${qty} in stock` : 'Out of stock'}
    </span>
  );

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      {!canManageInventory && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2.5 text-xs text-slate-600">
          <Lock className="h-4 w-4 text-slate-500 shrink-0" />
          <span>Read-only tire stock.</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by size, brand, or bin… (e.g. 225)"
              className="px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white sm:w-64"
            />
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
              {(['all', 'new', 'used'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setConditionFilter(c)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                    conditionFilter === c
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {c === 'all' ? 'All Tires' : CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {totalInStock} tires in stock
            </span>
            {canManageInventory && (
              <button
                type="button"
                onClick={() => openModal('new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Tire
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">
              {tires.length === 0 ? 'No tires in stock yet' : 'No tires match this search'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {canManageInventory
                ? 'Add tires by size, brand, new or used, and quantity.'
                : 'Management has not stocked any tires yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((t) => (
                <div key={t.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900">
                        {t.tireSize}
                        {t.brand ? ` · ${t.brand}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {CONDITION_LABELS[t.condition]}
                        {t.binLocation ? ` · Bin: ${t.binLocation}` : ''}
                        {t.notes ? ` · ${t.notes}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      {stockBadge(t.quantity)}
                      <span className={t.active ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                        {t.active ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    {canManageInventory && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={adjustingId === t.id}
                          onClick={() => handleAdjust(t, -1)}
                          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 min-h-[38px] min-w-[38px] flex items-center justify-center disabled:opacity-50"
                          aria-label={`Remove one ${t.tireSize} from stock`}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={adjustingId === t.id}
                          onClick={() => handleAdjust(t, 1)}
                          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 min-h-[38px] min-w-[38px] flex items-center justify-center disabled:opacity-50"
                          aria-label={`Add one ${t.tireSize} to stock`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal(t)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 min-h-[38px]"
                        >
                          <Edit2 className="h-3 w-3" />
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-4">Size</th>
                    <th className="py-2.5 px-4">Brand</th>
                    <th className="py-2.5 px-4">Condition</th>
                    <th className="py-2.5 px-4">In Stock</th>
                    <th className="py-2.5 px-4">Bin</th>
                    {isManager && <th className="py-2.5 px-4 text-right">Cost</th>}
                    <th className="py-2.5 px-4">Status</th>
                    {canManageInventory && <th className="py-2.5 px-4 text-right">Adjust / Edit</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900">
                        {t.tireSize}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{t.brand || '—'}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {CONDITION_LABELS[t.condition]}
                      </td>
                      <td className="py-3 px-4 text-xs">{stockBadge(t.quantity)}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{t.binLocation || '—'}</td>
                      {isManager && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          {t.costPrice !== undefined ? formatCurrency(t.costPrice) : '—'}
                        </td>
                      )}
                      <td className="py-3 px-4 text-xs">
                        <span className={t.active ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                          {t.active ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      {canManageInventory && (
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={adjustingId === t.id}
                              onClick={() => handleAdjust(t, -1)}
                              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-50"
                              aria-label={`Remove one ${t.tireSize} from stock`}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={adjustingId === t.id}
                              onClick={() => handleAdjust(t, 1)}
                              className="p-1.5 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-50"
                              aria-label={`Add one ${t.tireSize} to stock`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openModal(t)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 text-slate-700"
                            >
                              <Edit2 className="h-3 w-3" />
                              Edit
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Tire Modal */}
      {editing && canManageInventory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              {editing === 'new' ? 'Add Tire to Stock' : 'Edit Tire'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Tire Size (e.g., 225/65R17) *"
                  value={tireSize}
                  onChange={(e) => setTireSize(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                />
                <input
                  type="text"
                  placeholder="Brand (e.g., Michelin)"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                {(['new', 'used'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md ${
                      condition === c
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {CONDITION_LABELS[c]}
                  </button>
                ))}
              </div>
              <input
                type="number"
                required
                min={0}
                step="1"
                placeholder="Quantity in stock *"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isManager && (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Cost Price ($) — optional"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                  />
                )}
                <input
                  type="text"
                  placeholder="Bin / Rack Location (e.g., Rack 3B)"
                  value={binLocation}
                  onChange={(e) => setBinLocation(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <input
                type="text"
                placeholder="Notes (e.g., tread depth, take-off set)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Active in stock list
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <div>
                {editing !== 'new' && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteBlocked(false);
                      setDeleteTarget(editing);
                      setEditing(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Tire
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg"
                >
                  {saving ? 'Saving…' : 'Save Tire'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete Tire — two-step confirm (shop staff who can manage inventory;
          the edit modal only renders for them, so anyone else never sees it) */}
      {deleteTarget && canManageInventory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Delete this tire?</h3>
            <p className="text-sm text-slate-600">
              {deleteTarget.tireSize}
              {deleteTarget.brand ? ` · ${deleteTarget.brand}` : ''} ·{' '}
              {CONDITION_LABELS[deleteTarget.condition]} · {deleteTarget.quantity} in stock
            </p>
            {!deleteBlocked ? (
              <p className="text-xs text-slate-500">
                This can't be undone. Tires that are on a work order can't be deleted at
                all — they'll offer deactivation instead.
              </p>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
                <p className="text-xs font-medium text-amber-800">
                  This tire is on one or more work orders — deactivate it instead of
                  deleting.
                </p>
                <p className="text-xs text-amber-700">
                  Deactivating hides it from the stock list and the work-order picker,
                  but old work orders keep their tire.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              {deleteBlocked ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(null);
                      setDeleteBlocked(false);
                    }}
                    className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={deactivating}
                    onClick={handleDeactivateInstead}
                    className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg disabled:opacity-50"
                  >
                    {deactivating ? 'Deactivating…' : 'Deactivate instead'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeleteConfirm}
                    className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Delete Tire'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
