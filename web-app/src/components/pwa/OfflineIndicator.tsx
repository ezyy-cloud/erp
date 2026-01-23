import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * Offline Indicator Banner
 * 
 * Displays a subtle banner at the top of the screen when offline
 */
export function OfflineIndicator() {
  const { isOffline, wasOffline } = useNetworkStatus();

  if (!isOffline && !wasOffline) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 bg-orange-600 text-white px-4 py-2 text-sm font-medium text-center transition-transform duration-300 safe-area-top ${
        isOffline ? 'translate-y-0' : '-translate-y-full'
      }`}
      style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center justify-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span>
          {isOffline
            ? 'You are offline. Some features may be limited.'
            : wasOffline
            ? 'Connection restored'
            : ''}
        </span>
      </div>
    </div>
  );
}
