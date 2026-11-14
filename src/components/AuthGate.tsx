import React, { useState } from 'react';
import { Building2, LogIn, ShieldAlert } from 'lucide-react';
import { formatAppError } from '../lib/firebase';
import { BOOTSTRAP_ADMIN_EMAIL } from '../types';
import { BrandLogo, DEFAULT_SHOP_NAME } from './BrandLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthGateProps {
  mode: 'login' | 'create_shop' | 'unauthorized';
  userEmail?: string | null;
  userDisplayName?: string | null;
  authError?: string | null;
  onSignIn: () => void;
  onSignOut?: () => void;
  onCreateShop?: (payload: {
    ownerName: string;
    shopName: string;
    phone: string;
    iowaTaxRate: number;
  }) => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  mode,
  userEmail,
  userDisplayName,
  authError,
  onSignIn,
  onSignOut,
  onCreateShop,
}) => {
  const [ownerName, setOwnerName] = useState(userDisplayName || '');
  const [shopName, setShopName] = useState(DEFAULT_SHOP_NAME);
  const [phone, setPhone] = useState('');
  const [iowaTaxRate, setIowaTaxRate] = useState('7.0');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateShop || !shopName.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreateShop({
        ownerName: ownerName.trim() || 'Shop Owner',
        shopName: shopName.trim(),
        phone: phone.trim(),
        iowaTaxRate: Number(iowaTaxRate) || 7.0,
      });
    } catch (err) {
      setSubmitError(
        formatAppError(err, 'Could not create shop. A shop may already exist on this workspace.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen arcadia-track-bg flex flex-col justify-between p-4 sm:p-6">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3">
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 shadow-2xs">
          <BrandLogo size="sm" />
        </div>
        <PWAInstallButton />
      </header>

      <main className="max-w-md w-full mx-auto my-6 sm:my-10 bg-white border border-slate-200 border-t-2 border-t-[#C81E2B] rounded-xl p-5 sm:p-8 shadow-xs">
        {mode === 'login' && (
          <>
            <div className="mb-5">
              <BrandLogo size="lg" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
              Shop floor &amp; service counter
            </h1>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Sign in with your Google account to open the {DEFAULT_SHOP_NAME} management hub or
              access your assigned mechanic bay board.
            </p>

            {authError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              className="mt-6 w-full inline-flex items-center justify-center gap-2.5 rounded-lg bg-[#C81E2B] px-4 py-3 text-sm font-semibold text-white hover:bg-[#A61722] transition-colors min-h-[44px]"
            >
              <LogIn className="h-4 w-4" />
              Sign in with Google
            </button>

            <PWAInstallButton full />

            <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-1.5">
              <p className="font-medium text-slate-700">Setting up for the first time?</p>
              <p>
                Sign in with the Google account you want as the shop owner to create your company
                profile and add mechanic accounts.
              </p>
            </div>
          </>
        )}

        {mode === 'create_shop' && (
          <>
            <div className="flex items-center justify-between gap-3 mb-4">
              <BrandLogo size="md" />
              <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center text-[#C81E2B]">
                <Building2 className="h-4 w-4" />
              </div>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Create your shop account
            </h1>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              Signed in as <span className="font-mono text-slate-900">{userEmail}</span>. No shop
              is set up yet—enter your shop details below to become the management owner.
            </p>

            {submitError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Your Name *
                <input
                  type="text"
                  required
                  placeholder="e.g., David"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Shop Name *
                <input
                  type="text"
                  required
                  placeholder="e.g., Arcadia Tire Co."
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-600">
                  Shop Phone
                  <input
                    type="tel"
                    placeholder="(515) 555-0190"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Iowa Tax (%)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={25}
                    value={iowaTaxRate}
                    onChange={(e) => setIowaTaxRate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors min-h-[44px]"
              >
                {submitting ? 'Creating Shop…' : 'Create Shop & Continue'}
              </button>
            </form>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-800 py-1.5"
              >
                Or sign out and use a different Google account
              </button>
            )}
          </>
        )}

        {mode === 'unauthorized' && (
          <>
            <div className="h-10 w-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mb-4">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Account not registered to shop
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Signed in as <span className="font-mono text-slate-900">{userEmail}</span>, which is
              not listed as an active staff member in this shop’s Company Profile.
            </p>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Sign in with the shop owner account (<span className="font-mono text-slate-700">{BOOTSTRAP_ADMIN_EMAIL}</span> or the email that created the shop) and add{' '}
              <span className="font-mono text-slate-700">{userEmail}</span> under{' '}
              <strong>Shop &amp; Exports → Mechanic &amp; Management Accounts</strong>.
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-6 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              Sign out &amp; switch account
            </button>
          </>
        )}
      </main>

      <footer className="max-w-5xl w-full mx-auto text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-1 text-center sm:text-left">
        <span>{DEFAULT_SHOP_NAME} · Offline-First Shop PWA</span>
        <span>Iowa Tax &amp; Tekmetric CSV Ready</span>
      </footer>
    </div>
  );
};
