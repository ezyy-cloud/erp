import { WifiOff, RefreshCw } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Button } from '@/components/ui/button';

interface OfflineMessageProps {
  message?: string;
  showRetry?: boolean;
  onRetry?: () => void;
}

/**
 * Full-screen offline message
 * 
 * Displays when critical operations require network connectivity
 */
export function OfflineMessage({
  message = 'This action requires an internet connection.',
  showRetry = true,
  onRetry,
}: OfflineMessageProps) {
  const { isOffline } = useNetworkStatus();

  if (!isOffline) {
    return null;
  }

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <WifiOff className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">You're Offline</h2>
          <p className="text-muted-foreground">{message}</p>
        </div>
        {showRetry && (
          <Button onClick={handleRetry} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </Button>
        )}
      </div>
    </div>
  );
}
