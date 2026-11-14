import React, { useEffect, useState } from 'react';
import {
  Bell,
  Building2,
  Check,
  Download,
  FileSpreadsheet,
  Lock,
  LogOut,
  ShieldCheck,
  UserCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  exportAllCsvs,
  exportCustomersCsv,
  exportPriceListCsv,
  exportVehiclesCsv,
  exportWorkOrdersCsv,
} from '../lib/csvExport';
import {
  getStaffNotificationPermission,
  requestStaffNotificationPermission,
} from '../lib/notifications';
import { formatAppError } from '../lib/firebase';
import { saveCompanyProfile, upsertStaffMember, type ActorInfo } from '../lib/shopService';
import type {
  CompanyProfile,
  Customer,
  ServiceCatalogItem,
  StaffMember,
  StaffRole,
  Vehicle,
  WorkOrder,
} from '../types';

interface CompanyStaffExportsViewProps {
  company: CompanyProfile | null;
  staff: StaffMember[];
  customers: Customer[];
  vehicles: Vehicle[];
  workOrders: WorkOrder[];
  services: ServiceCatalogItem[];
  actor: ActorInfo;
  effectiveRole: StaffRole;
  myStaffDoc?: StaffMember | null;
  isBootstrapAdmin?: boolean;
  emailVerified?: boolean;
  onSignOut?: () => void;
  chimeEnabled: boolean;
  onToggleChime: (val: boolean) => void;
}

export const CompanyStaffExportsView: React.FC<CompanyStaffExportsViewProps> = ({
  company,
  staff,
  customers,
  vehicles,
  workOrders,
  services,
  actor,
  effectiveRole,
  myStaffDoc,
  isBootstrapAdmin,
  emailVerified,
  onSignOut,
  chimeEnabled,
  onToggleChime,
}) => {
  const isManager = effectiveRole === 'management';

  // Company form
  const [shopName, setShopName] = useState(company?.shopName || '');
  const [address, setAddress] = useState(company?.address || '');
  const [cityStateZip, setCityStateZip] = useState(company?.cityStateZip || '');
  const [phone, setPhone] = useState(company?.phone || '');
  const [email, setEmail] = useState(company?.email || '');
  const [iowaTaxRate, setIowaTaxRate] = useState(String(company?.iowaTaxRate ?? 7.0));
  const [workOrderPrefix, setWorkOrderPrefix] = useState(company?.workOrderPrefix || 'WO-');
  const [receiptFooter, setReceiptFooter] = useState(
    company?.receiptFooter || 'Thank you for your business. Torque lug nuts after 50 miles.'
  );
  const [savingCompany, setSavingCompany] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  // Staff modal/form
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | undefined>(undefined);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('mechanic');
  const [staffBay, setStaffBay] = useState('');
  const [staffActive, setStaffActive] = useState(true);
  const [savingStaff, setSavingStaff] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Push notification permission
  const [notifPermission, setNotifPermission] = useState(getStaffNotificationPermission());

  useEffect(() => {
    if (company) {
      setShopName(company.shopName);
      setAddress(company.address || '');
      setCityStateZip(company.cityStateZip || '');
      setPhone(company.phone || '');
      setEmail(company.email || '');
      setIowaTaxRate(String(company.iowaTaxRate));
      setWorkOrderPrefix(company.workOrderPrefix);
      setReceiptFooter(company.receiptFooter || '');
    }
  }, [company]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager || !shopName.trim()) return;
    setSavingCompany(true);
    setErrorMsg(null);
    try {
      await saveCompanyProfile(
        {
          shopName,
          address,
          cityStateZip,
          phone,
          email,
          iowaTaxRate: Number(iowaTaxRate) || 0,
          workOrderPrefix,
          nextOrderNumber: company?.nextOrderNumber || 1001,
          receiptFooter,
        },
        actor.uid,
        !company,
        { name: actor.name, email: actor.email }
      );
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to save company profile.'));
    } finally {
      setSavingCompany(false);
    }
  };

  const openStaffForm = (member?: StaffMember) => {
    if (!isManager) return;
    setEditingStaff(member);
    if (member) {
      setStaffName(member.name);
      setStaffEmail(member.email);
      setStaffRole(member.role);
      setStaffBay(member.baySpecialty || '');
      setStaffActive(member.active);
    } else {
      setStaffName('');
      setStaffEmail('');
      setStaffRole('mechanic');
      setStaffBay('');
      setStaffActive(true);
    }
    setShowAddStaff(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager || !staffName.trim() || !staffEmail.trim()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffEmail.trim())) {
      setErrorMsg('Please enter a valid Google email address.');
      return;
    }
    setSavingStaff(true);
    setErrorMsg(null);
    try {
      await upsertStaffMember(
        {
          name: staffName,
          email: staffEmail,
          role: staffRole,
          baySpecialty: staffBay,
          active: staffActive,
        },
        editingStaff,
        actor.uid
      );
      setShowAddStaff(false);
    } catch (err) {
      setErrorMsg(formatAppError(err, 'Unable to save staff account.'));
    } finally {
      setSavingStaff(false);
    }
  };

  const handleEnablePush = async () => {
    const res = await requestStaffNotificationPermission();
    setNotifPermission(res);
  };

  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* 0. Your Profile & Signed-In Account */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-[#C81E2B]" />
              Your Profile &amp; Signed-In Account
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active Google session and shop role permissions currently used for all updates.
            </p>
          </div>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap min-h-[40px] shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out / Switch Account
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
            <p className="text-slate-500">Display Name</p>
            <p className="font-semibold text-slate-900 mt-1 truncate">{actor.name}</p>
          </div>
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
            <p className="text-slate-500">Google Email</p>
            <p className="font-mono font-medium text-slate-900 mt-1 truncate">{actor.email}</p>
            <p className="inline-flex items-center gap-1 text-[11px] text-emerald-700 mt-0.5">
              <ShieldCheck className="h-3 w-3" />
              {emailVerified === false ? 'Email unverified' : 'Verified Google Account'}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
            <p className="text-slate-500">Access Role</p>
            <p className="font-semibold text-slate-900 capitalize mt-1">
              {actor.role === 'management'
                ? isBootstrapAdmin
                  ? 'Management · Shop Owner'
                  : 'Management'
                : 'Mechanic'}
            </p>
            {effectiveRole !== actor.role && (
              <p className="text-[11px] text-[#C81E2B] mt-0.5">
                Previewing as {effectiveRole}
              </p>
            )}
          </div>
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60">
            <p className="text-slate-500">Bay / Specialty</p>
            <p className="font-semibold text-slate-900 mt-1 truncate">
              {myStaffDoc?.baySpecialty || (isBootstrapAdmin ? 'Owner / Management' : '—')}
            </p>
          </div>
        </div>
      </section>

      {/* 1. Mechanic & Staff Accounts (Top for quick hiring/onboarding) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#C81E2B]" />
              Mechanic &amp; Staff Accounts
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add a mechanic’s Google email here. When they sign in, they automatically land on the
              locked-price Mechanic Bay Dashboard.
            </p>
          </div>
          {isManager && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[44px] sm:min-h-[40px]"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
                {copiedLink ? 'Login Link Copied' : 'Copy Mechanic Login Link'}
              </button>
              <button
                type="button"
                onClick={() => openStaffForm()}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap min-h-[44px] sm:min-h-[40px]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add Mechanic
              </button>
            </div>
          )}
        </div>

        {staff.length === 0 ? (
          <div className="p-5 sm:p-6 text-xs text-slate-500">
            No employee accounts added yet. Click <strong>Add Mechanic</strong>, enter their name
            and Google email, then share the app link so they can sign in to their bay board.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {staff.map((member) => (
              <div
                key={member.id}
                className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{member.name}</p>
                  <p className="text-xs text-slate-500 font-mono break-all">
                    {member.email} ·{' '}
                    <span className="capitalize">{member.role}</span>
                    {member.baySpecialty ? ` · ${member.baySpecialty}` : ''}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span
                    className={`text-xs font-medium ${
                      member.active ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {member.active ? 'Active' : 'Inactive'}
                  </span>
                  {isManager && (
                    <button
                      type="button"
                      onClick={() => openStaffForm(member)}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 min-h-[38px]"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. One-Click Tekmetric CSV Export Center */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#C81E2B]" />
              Export Everything (Tekmetric CSV Ready)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Download clean, standard CSV files for seamless import into Tekmetric or spreadsheets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exportAllCsvs({ customers, vehicles, workOrders, services })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap min-h-[40px]"
          >
            <Download className="h-3.5 w-3.5" />
            Download All 4 CSVs
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => exportCustomersCsv(customers)}
            className="p-3.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-left transition-colors"
          >
            <p className="text-xs font-semibold text-slate-900">Customers CSV</p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {customers.length} records
            </p>
          </button>
          <button
            type="button"
            onClick={() => exportVehiclesCsv(vehicles)}
            className="p-3.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-left transition-colors"
          >
            <p className="text-xs font-semibold text-slate-900">Vehicles CSV</p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {vehicles.length} records
            </p>
          </button>
          <button
            type="button"
            onClick={() => exportWorkOrdersCsv(workOrders)}
            className="p-3.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-left transition-colors"
          >
            <p className="text-xs font-semibold text-slate-900">Work Orders CSV</p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {workOrders.length} orders
            </p>
          </button>
          <button
            type="button"
            onClick={() => exportPriceListCsv(services)}
            className="p-3.5 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-left transition-colors"
          >
            <p className="text-xs font-semibold text-slate-900">Price List CSV</p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
              {services.length} services
            </p>
          </button>
        </div>
      </section>

      {/* 2. Staff Push Notifications */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#C81E2B]" />
            Staff Bay Push Alerts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mechanics get pinged on new jobs; management gets pinged when jobs are marked Ready.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={chimeEnabled}
              onChange={(e) => onToggleChime(e.target.checked)}
              className="rounded border-slate-300"
            />
            Bay Chime Sound
          </label>
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={notifPermission === 'granted' || notifPermission === 'unsupported'}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium min-h-[40px] ${
              notifPermission === 'granted'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {notifPermission === 'granted'
              ? 'Push Alerts Enabled'
              : notifPermission === 'unsupported'
              ? 'Browser Unsupported'
              : notifPermission === 'denied'
              ? 'Blocked in Browser Settings'
              : 'Enable Push Alerts'}
          </button>
        </div>
      </section>

      {/* 3. Company Profile */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-600" />
              Company Profile &amp; Iowa Tax
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Printed on PDF receipts and used to calculate Iowa sales tax automatically.
            </p>
          </div>
          {!isManager && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 shrink-0">
              <Lock className="h-3.5 w-3.5" /> Read-only
            </span>
          )}
        </div>

        <form onSubmit={handleSaveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <label className="block text-xs font-medium text-slate-600">
            Shop Name *
            <input
              type="text"
              required
              disabled={!isManager}
              placeholder="e.g., Arcadia Tire Co."
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Shop Phone
            <input
              type="tel"
              disabled={!isManager}
              placeholder="(319) 555-0142"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Street Address
            <input
              type="text"
              disabled={!isManager}
              placeholder="412 Industrial Ave"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            City, State, ZIP
            <input
              type="text"
              disabled={!isManager}
              placeholder="Cedar Rapids, IA 52404"
              value={cityStateZip}
              onChange={(e) => setCityStateZip(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Shop Email
            <input
              type="email"
              disabled={!isManager}
              placeholder="service@yourshop.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              Iowa Sales Tax (%)
              <input
                type="number"
                step="0.01"
                min={0}
                max={25}
                disabled={!isManager}
                value={iowaTaxRate}
                onChange={(e) => setIowaTaxRate(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono disabled:bg-slate-50"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              WO# Prefix
              <input
                type="text"
                maxLength={10}
                disabled={!isManager}
                value={workOrderPrefix}
                onChange={(e) => setWorkOrderPrefix(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono disabled:bg-slate-50"
              />
            </label>
          </div>
          <label className="block md:col-span-2 text-xs font-medium text-slate-600">
            Receipt Footer Note
            <input
              type="text"
              disabled={!isManager}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </label>

          {isManager && (
            <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-3 pt-1">
              {savedBanner && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Company profile saved
                </span>
              )}
              <button
                type="submit"
                disabled={savingCompany}
                className="w-full sm:w-auto rounded-lg bg-slate-900 px-5 py-2.5 sm:py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[44px] sm:min-h-[40px]"
              >
                {savingCompany ? 'Saving…' : 'Save Company Profile'}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Add/Edit Staff Modal */}
      {showAddStaff && isManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4">
          <form
            onSubmit={handleSaveStaff}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900">
              {editingStaff ? 'Edit Staff Account' : 'Create Mechanic / Staff Account'}
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                required
                placeholder="Full Name *"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
              <input
                type="email"
                required
                disabled={!!editingStaff}
                placeholder="Google Email Address *"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="mechanic">Mechanic (Locked Prices)</option>
                  <option value="management">Management (Full Access)</option>
                </select>
                <input
                  type="text"
                  placeholder="Bay / Specialty"
                  value={staffBay}
                  onChange={(e) => setStaffBay(e.target.value)}
                  className="px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer min-h-[36px]">
                <input
                  type="checkbox"
                  checked={staffActive}
                  onChange={(e) => setStaffActive(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Account Active
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddStaff(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-200 rounded-lg min-h-[44px] sm:min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStaff}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg min-h-[44px] sm:min-h-[40px]"
              >
                {savingStaff ? 'Saving…' : 'Save Account'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
