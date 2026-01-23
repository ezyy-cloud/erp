import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  wasOffline: boolean; // True if we just came back online
}

/**
 * Hook to detect network online/offline status
 * 
 * @returns NetworkStatus object with isOnline, isOffline, and wasOffline flags
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => {
    // Check initial state
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine;
    }
    // Default to online if we can't determine
    return true;
  });
  
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Set initial state
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      
      // If we just came back online, set wasOffline flag
      if (online && !isOnline) {
        setWasOffline(true);
        // Clear the flag after a short delay
        setTimeout(() => setWasOffline(false), 2000);
      }
      
      setIsOnline(online);
    };

    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Also check periodically (some browsers don't fire events reliably)
    const interval = setInterval(() => {
      if (navigator.onLine !== isOnline) {
        updateOnlineStatus();
      }
    }, 5000); // Check every 5 seconds

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(interval);
    };
  }, [isOnline]);

  return {
    isOnline,
    isOffline: !isOnline,
    wasOffline,
  };
}
