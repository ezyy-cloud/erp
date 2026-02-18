import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const DISMISSED_KEY = 'pwa-install-prompt-dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Install Prompt Component
 * 
 * Displays a subtle, dismissible prompt encouraging users to install the PWA
 */
export function InstallPrompt() {
  const { isInstalled, isInstallable, canInstall, promptInstall } = useInstallPrompt();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed
    if (isInstalled) {
      setIsVisible(false);
      return;
    }

    // Check if user has dismissed the prompt
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (dismissedUntil) {
      const dismissedTime = Number.parseInt(dismissedUntil, 10);
      if (Date.now() < dismissedTime) {
        setIsDismissed(true);
        setIsVisible(false);
        return;
      } else {
        // Dismissal period expired, clear it
        localStorage.removeItem(DISMISSED_KEY);
      }
    }

    // Show prompt if installable and not dismissed
    if (isInstallable && canInstall) {
      // Small delay to avoid showing immediately on page load
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 3000); // Show after 3 seconds

      return () => clearTimeout(timer);
    }
  }, [isInstalled, isInstallable, canInstall]);

  const handleInstall = async () => {
    const success = await promptInstall();
    if (success) {
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    // Store dismissal timestamp (7 days from now)
    const dismissedUntil = Date.now() + DISMISS_DURATION;
    localStorage.setItem(DISMISSED_KEY, dismissedUntil.toString());
    setIsDismissed(true);
    setIsVisible(false);
  };

  if (!isVisible || isInstalled || isDismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-sm z-[60] animate-in slide-in-from-bottom-5 duration-300">
      <Card className="shadow-lg border-primary/20 bg-background/95 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-1">Install Ezyy ERP</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Install our app for a faster, more convenient experience with offline access.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleInstall}
                  size="sm"
                  className="flex-1"
                >
                  Install
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
