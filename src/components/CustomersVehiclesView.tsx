import React, { useMemo, useState } from 'react';
import { Car, Edit2, Plus, Search, UserPlus } from 'lucide-react';
import { formatAppError } from '../lib/firebase';
import { saveCustomer, saveVehicle, type ActorInfo } from '../lib/shopService';
import type { Customer, Vehicle } from '../types';

interface CustomersVehiclesViewProps {
  customers: Customer[];
  vehicles: Vehicle[];
  actor: ActorInfo;
  onCreateOrderForVehicle: (customer: Customer, vehicle: Vehicle) => void;
}

export const CustomersVehiclesView: React.FC<CustomersVehiclesViewProps> = ({
  customers,
  vehicles,
  actor,
  onCreateOrderForVehicle,
}) => {
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | 'new' | null>(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custNotes, setCustNotes] = useState('');

  const [addingVehicleFor, setAddingVehicleFor] = useState<{
    customer: Customer;
    vehicle?: Vehicle;
  } | null>(null);
  const [vehYear, setVehYear] = useState(new Date().getFullYear());
  const [vehMake, setVehMake] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehPlate, setVehPlate] = useState('');
  const [vehVin, setVehVin] = useState('');
  const [vehMileage, setVehMileage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const openCustomerModal = (customer: Customer | 'new') => {
    setEditingCustomer(customer);
    if (customer === 'new') {
      setCustName('');
      setCustPhone('');
      setCustEmail('');
      setCustNotes('');
    } else {
      setCustName(customer.name);
      setCustPhone(customer.phone);
      setCustEmail(customer.email || '');
      setCustNotes(customer.notes || '');
    }
  };

  const openVehicleModal = (customer: Customer, vehicle?: Vehicle) => {
    setAddingVehicleFor({ customer, vehicle });
    if (vehicle) {
      setVehYear(vehicle.year);
      setVehMake(vehicle.make);
      setVehModel(vehicle.model);
      setVehPlate(vehicle.licensePlate || '');
      setVehVin(vehicle.vin || '');
      setVehMileage(vehicle.mileage);
    } else {
      setVehYear(new Date().getFullYear());
      setVehMake('');
      setVehModel('');
      setVehPlate('');
      setVehVin('');
      setVehMileage(0);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custPhone.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveCustomer(
        { name: custName, phone: custPhone, email: custEmail, notes: custNotes },
        editingCustomer === 'new' ? undefined : editingCustomer || undefined,
        actor.uid
      );
      setEditingCustomer(null);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to save customer.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingVehicleFor || !vehMake.trim() || !vehModel.trim()) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      await saveVehicle(
        {
          customerId: addingVehicleFor.customer.id,
          customerName: addingVehicleFor.customer.name,
          year: vehYear,
          make: vehMake,
          model: vehModel,
          licensePlate: vehPlate,
          vin: vehVin,
          mileage: vehMileage,
        },
        addingVehicleFor.vehicle,
        actor.uid
      );
      setAddingVehicleFor(null);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to save vehicle.'));
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const custVehicles = vehicles.filter((v) => v.customerId === c.id);
      const hay = [
        c.name,
        c.phone,
        c.email,
        ...custVehicles.map((v) => `${v.year} ${v.make} ${v.model} ${v.licensePlate} ${v.vin}`),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [customers, vehicles, search]);

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, plate, or VIN…"
            className="w-full pl-9 pr-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none min-h-[42px] sm:min-h-[40px]"
          />
        </div>
        <button
          type="button"
          onClick={() => openCustomerModal('new')}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 sm:py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap min-h-[44px] sm:min-h-[40px]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Add Customer
        </button>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl py-14 px-6 text-center">
          <p className="text-sm font-medium text-slate-900">No customers found</p>
          <p className="mt-1 text-xs text-slate-500">
            Add customers here or directly while creating a new work order.
          </p>
          <button
            type="button"
            onClick={() => openCustomerModal('new')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Customer
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCustomers.map((cust) => {
            const custVehicles = vehicles.filter((v) => v.customerId === cust.id);
            return (
              <div
                key={cust.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{cust.name}</h3>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5 break-all">
                      {cust.phone}
                      {cust.email ? ` · ${cust.email}` : ''}
                    </p>
                    {cust.notes && (
                      <p className="text-xs text-slate-500 mt-1.5">{cust.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openCustomerModal(cust)}
                      className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 min-h-[38px] min-w-[38px] flex items-center justify-center"
                      aria-label="Edit customer"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openVehicleModal(cust)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 min-h-[38px]"
                    >
                      <Car className="h-3.5 w-3.5" />
                      Add Vehicle
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3 space-y-2.5">
                  {custVehicles.length === 0 ? (
                    <p className="text-xs text-slate-400">No vehicles on file yet.</p>
                  ) : (
                    custVehicles.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900">
                            {v.year} {v.make} {v.model}
                          </span>
                          <span className="block sm:inline sm:ml-2 text-slate-500 font-mono mt-0.5 sm:mt-0">
                            {v.licensePlate || 'No plate'} · {v.mileage.toLocaleString()} mi
                          </span>
                          {v.vin && (
                            <span className="block text-[11px] text-slate-400 font-mono truncate">
                              VIN: {v.vin}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => openVehicleModal(cust, v)}
                            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-md min-h-[36px]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onCreateOrderForVehicle(cust, v)}
                            className="flex-1 sm:flex-initial px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 min-h-[36px]"
                          >
                            + Work Order
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              {editingCustomer === 'new' ? 'Add Customer' : 'Edit Customer'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Customer Name *"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="tel"
                required
                placeholder="Phone Number *"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={custEmail}
                onChange={(e) => setCustEmail(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <textarea
                rows={2}
                placeholder="Notes"
                value={custNotes}
                onChange={(e) => setCustNotes(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg min-h-[44px] sm:min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg min-h-[44px] sm:min-h-[40px]"
              >
                {saving ? 'Saving…' : 'Save Customer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Vehicle Modal */}
      {addingVehicleFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4">
          <form
            onSubmit={handleSaveVehicle}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4 shadow-xl"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {addingVehicleFor.vehicle ? 'Edit Vehicle' : 'Add Vehicle'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Owner: {addingVehicleFor.customer.name}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="number"
                required
                min={1900}
                max={2100}
                placeholder="Year *"
                value={vehYear || ''}
                onChange={(e) => setVehYear(e.target.value === '' ? 0 : Number(e.target.value))}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
              />
              <input
                type="number"
                required
                min={0}
                placeholder="Mileage *"
                value={vehMileage}
                onChange={(e) => setVehMileage(Number(e.target.value) || 0)}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
              />
              <input
                type="text"
                required
                placeholder="Make *"
                value={vehMake}
                onChange={(e) => setVehMake(e.target.value)}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                required
                placeholder="Model *"
                value={vehModel}
                onChange={(e) => setVehModel(e.target.value)}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                placeholder="License Plate"
                value={vehPlate}
                onChange={(e) => setVehPlate(e.target.value)}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono uppercase"
              />
              <input
                type="text"
                placeholder="VIN"
                value={vehVin}
                onChange={(e) => setVehVin(e.target.value)}
                className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono uppercase"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddingVehicleFor(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg min-h-[44px] sm:min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg min-h-[44px] sm:min-h-[40px]"
              >
                {saving ? 'Saving…' : 'Save Vehicle'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
