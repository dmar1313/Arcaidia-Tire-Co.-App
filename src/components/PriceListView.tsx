import React, { useMemo, useState } from 'react';
import { Edit2, History, Lock, Plus } from 'lucide-react';
import { formatCurrency, formatTimestamp } from '../lib/calculations';
import { formatAppError } from '../lib/firebase';
import {
  createServiceCatalogItem,
  updateServiceCatalogItem,
  type ActorInfo,
} from '../lib/shopService';
import {
  SERVICE_CATEGORY_LABELS,
  type PriceAuditEntry,
  type ServiceCatalogItem,
  type ServiceCategory,
  type StaffRole,
} from '../types';

interface PriceListViewProps {
  services: ServiceCatalogItem[];
  priceAuditLog: PriceAuditEntry[];
  effectiveRole: StaffRole;
  actor: ActorInfo;
}

export const PriceListView: React.FC<PriceListViewProps> = ({
  services,
  priceAuditLog,
  effectiveRole,
  actor,
}) => {
  const isManager = effectiveRole === 'management';
  const [categoryFilter, setCategoryFilter] = useState<'all' | ServiceCategory>('all');
  const [editing, setEditing] = useState<ServiceCatalogItem | 'new' | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ServiceCategory>('tire_repair');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('0.00');
  const [stockQuantity, setStockQuantity] = useState('');
  const [tireSize, setTireSize] = useState('');
  const [brand, setBrand] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [taxable, setTaxable] = useState(true);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openModal = (item: ServiceCatalogItem | 'new') => {
    if (!isManager) return;
    setEditing(item);
    if (item === 'new') {
      setName('');
      setCategory('tire_sale');
      setDescription('');
      setUnitPrice('');
      setStockQuantity('');
      setTireSize('');
      setBrand('');
      setBinLocation('');
      setTaxable(true);
      setActive(true);
    } else {
      setName(item.name);
      setCategory(item.category);
      setDescription(item.description || '');
      setUnitPrice(String(item.unitPrice));
      setStockQuantity(item.stockQuantity !== undefined ? String(item.stockQuantity) : '');
      setTireSize(item.tireSize || '');
      setBrand(item.brand || '');
      setBinLocation(item.binLocation || '');
      setTaxable(item.taxable);
      setActive(item.active);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager || !name.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload: Parameters<typeof createServiceCatalogItem>[0] = {
        name,
        category,
        description,
        unitPrice: Math.max(0, Number(unitPrice) || 0),
        taxable,
        active,
      };

      if (stockQuantity.trim() !== '') {
        payload.stockQuantity = Math.max(0, parseInt(stockQuantity, 10) || 0);
      }
      if (tireSize.trim() !== '') {
        payload.tireSize = tireSize.trim();
      }
      if (brand.trim() !== '') {
        payload.brand = brand.trim();
      }
      if (binLocation.trim() !== '') {
        payload.binLocation = binLocation.trim();
      }

      if (editing === 'new') {
        await createServiceCatalogItem(payload, actor);
      } else if (editing) {
        await updateServiceCatalogItem(editing, payload, actor);
      }
      setEditing(null);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to save service item.'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(
    () =>
      services.filter((s) =>
        categoryFilter === 'all' ? true : s.category === categoryFilter
      ),
    [services, categoryFilter]
  );

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      {!isManager && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2.5 text-xs text-slate-600">
          <Lock className="h-4 w-4 text-slate-500 shrink-0" />
          <span>
            Read-only catalog. Only shop management can add services or adjust pricing.
          </span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['all', 'tire_repair', 'tire_sale', 'oil_change', 'tune_up', 'maintenance', 'part'] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                    categoryFilter === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat === 'all' ? 'All Services' : SERVICE_CATEGORY_LABELS[cat]}
                </button>
              )
            )}
          </div>

          {isManager && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openModal('new')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[40px]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Service / Tire
              </button>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-900">No services in price list yet</p>
            <p className="mt-1 text-xs text-slate-500">
              {isManager
                ? 'Add your shop services, tires, or parts using the button above.'
                : 'Management has not configured the price list yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100">
              {filtered.map((svc) => (
                <div key={svc.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900">{svc.name}</p>
                      {(svc.brand || svc.tireSize) && (
                        <p className="text-xs font-medium text-slate-700 mt-0.5">
                          {svc.brand} {svc.tireSize ? `(${svc.tireSize})` : ''}
                        </p>
                      )}
                      {svc.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{svc.description}</p>
                      )}
                    </div>
                    <span className="text-sm font-mono tabular-nums font-bold text-slate-900 shrink-0">
                      {formatCurrency(svc.unitPrice)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-slate-500">
                      <span>{SERVICE_CATEGORY_LABELS[svc.category]}</span>
                      {svc.stockQuantity !== undefined && (
                        <>
                          <span>·</span>
                          <span className={svc.stockQuantity > 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
                            {svc.stockQuantity > 0 ? `${svc.stockQuantity} in stock` : 'Out of stock'}
                          </span>
                        </>
                      )}
                      {svc.binLocation && (
                        <>
                          <span>·</span>
                          <span>Bin: {svc.binLocation}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{svc.taxable ? 'Iowa Taxable' : 'Exempt'}</span>
                      <span>·</span>
                      <span className={svc.active ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                        {svc.active ? 'Active' : 'Archived'}
                      </span>
                    </div>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => openModal(svc)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 min-h-[38px] shrink-0"
                      >
                        <Edit2 className="h-3 w-3" />
                        Edit
                      </button>
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
                    <th className="py-2.5 px-4">Service / Tire Item</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Inventory / Stock</th>
                    <th className="py-2.5 px-4">Tax</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Unit Price</th>
                    {isManager && <th className="py-2.5 px-4 text-right">Edit</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filtered.map((svc) => (
                    <tr key={svc.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{svc.name}</p>
                        {(svc.brand || svc.tireSize) && (
                          <p className="text-xs font-semibold text-slate-700 mt-0.5">
                            {svc.brand} {svc.tireSize ? `· Size: ${svc.tireSize}` : ''}
                          </p>
                        )}
                        {svc.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{svc.description}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {SERVICE_CATEGORY_LABELS[svc.category]}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {svc.stockQuantity !== undefined ? (
                          <div className="space-y-0.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              svc.stockQuantity > 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}>
                              {svc.stockQuantity > 0 ? `${svc.stockQuantity} in stock` : 'Out of stock'}
                            </span>
                            {svc.binLocation && (
                              <p className="text-[11px] text-slate-500">Loc: {svc.binLocation}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {svc.taxable ? 'Iowa Taxable' : 'Exempt'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className={svc.active ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                          {svc.active ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatCurrency(svc.unitPrice)}
                      </td>
                      {isManager && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openModal(svc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 text-slate-700"
                          >
                            <Edit2 className="h-3 w-3" />
                            Edit
                          </button>
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

      {/* Price Change Audit Trail */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-900">Price Change Audit Log</h3>
        </div>
        {priceAuditLog.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">
            No price adjustments logged yet. Every price change made by management is permanently
            recorded here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {priceAuditLog.slice(0, 20).map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-medium text-slate-900">{entry.serviceName}</span>
                  <span className="text-slate-500 ml-2">
                    changed by {entry.actorName}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono tabular-nums text-slate-700">
                    {formatCurrency(entry.oldPrice)} →{' '}
                    <strong className="text-slate-900">{formatCurrency(entry.newPrice)}</strong>
                  </span>
                  <span className="font-mono text-slate-400">
                    {formatTimestamp(entry.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Service Modal */}
      {editing && isManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              {editing === 'new' ? 'Add Service / Tire / Part' : 'Edit Service Pricing'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Service Name (e.g., Flat Tire Repair) *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {Object.entries(SERVICE_CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  placeholder="Unit Price ($)"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Tire Size (e.g., 225/65R17)"
                  value={tireSize}
                  onChange={(e) => setTireSize(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Brand (e.g., Michelin, Goodyear)"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="In-Stock Quantity (e.g., 8)"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                />
                <input
                  type="text"
                  placeholder="Bin / Rack Location (e.g., Rack 3B)"
                  value={binLocation}
                  onChange={(e) => setBinLocation(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <textarea
                rows={2}
                placeholder="Short description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <div className="flex items-center gap-6 pt-1 text-xs text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxable}
                    onChange={(e) => setTaxable(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Apply Iowa Sales Tax
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Active on Menu
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
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
                {saving ? 'Saving…' : 'Save Price'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
