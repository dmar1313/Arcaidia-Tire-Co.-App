import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ full?: boolean }> = ({ full = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const btnClass = full
    ? 'w-full mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors min-h-[44px]'
    : 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]';

  if (isInstallable) {
    return (
      <button type="button" onClick={install} className={btnClass}>
        <Download className="h-3.5 w-3.5 text-[#C81E2B]" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button type="button" onClick={() => setShowIOSGuide(true)} className={btnClass}>
          <Smartphone className="h-3.5 w-3.5 text-[#C81E2B]" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Install on iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-sm text-slate-600">
                <li>1. Tap the <strong>Share</strong> icon in Safari’s toolbar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                <li>3. Launch Arcadia Tire Co. from your home screen for offline bay use.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Mobile Android / other browsers: Chrome often never fires
  // beforeinstallprompt on phones, so the button used to vanish
  // entirely. Always show it — tapping opens manual install steps.
  return (
    <>
      <button type="button" onClick={() => setShowAndroidGuide(true)} className={btnClass}>
        <Smartphone className="h-3.5 w-3.5 text-[#C81E2B]" />
        Install App
      </button>

      {showAndroidGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Install on your phone</h3>
              <button
                type="button"
                onClick={() => setShowAndroidGuide(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                1. In Chrome, tap the <strong>⋮ menu</strong> (top right).
              </li>
              <li>
                2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </li>
              <li>
                3. Launch Arcadia Tire Co. from your home screen for offline bay use.
              </li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">
              On Samsung Internet: menu → Add page to → Home screen. On iPhone use Safari, not
              Chrome.
            </p>
            <button
              type="button"
              onClick={() => setShowAndroidGuide(false)}
              className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
