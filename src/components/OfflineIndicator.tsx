import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  pendingCount: number;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ pendingCount }) => {
  const isOnline = useOnlineStatus();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`print:hidden fixed bottom-20 left-4 md:bottom-4 z-50 max-w-[calc(100vw-2rem)] flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium shadow-lg border ${
        !isOnline
          ? 'bg-amber-600 text-white border-amber-700'
          : 'bg-slate-900 text-white border-slate-800'
      }`}
    >
      {!isOnline ? (
        <>
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            Offline Mode — {pendingCount > 0 ? `${pendingCount} change(s) queued to sync` : 'Working from local cache'}
          </span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>Syncing {pendingCount} offline change(s)…</span>
        </>
      )}
    </div>
  );
};
