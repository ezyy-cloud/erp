/**
 * Service Worker Registration
 * 
 * Handles service worker registration, updates, and lifecycle management
 */

export interface ServiceWorkerRegistrationState {
  registration: ServiceWorkerRegistration | null;
  updateAvailable: boolean;
  installing: boolean;
}

let registrationState: ServiceWorkerRegistrationState = {
  registration: null,
  updateAvailable: false,
  installing: false,
};

let updateCallbacks: Array<() => void> = [];

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    (window.location.protocol === 'https:' || window.location.hostname === 'localhost')
  );
}

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.log('[SW] Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none', // Always check for updates
    });

    registrationState.registration = registration;

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      registrationState.installing = true;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New service worker available
            registrationState.updateAvailable = true;
            registrationState.installing = false;
            notifyUpdateCallbacks();
          } else {
            // First install
            registrationState.installing = false;
            console.log('[SW] Service worker installed');
          }
        }
      });
    });

    // Check for updates periodically
    setInterval(() => {
      registration.update();
    }, 60000); // Check every minute

    console.log('[SW] Service worker registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}

/**
 * Unregister the service worker (for testing/cleanup)
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!registrationState.registration) {
    return false;
  }

  try {
    const unregistered = await registrationState.registration.unregister();
    if (unregistered) {
      registrationState.registration = null;
      registrationState.updateAvailable = false;
      console.log('[SW] Service worker unregistered');
    }
    return unregistered;
  } catch (error) {
    console.error('[SW] Unregistration failed:', error);
    return false;
  }
}

/**
 * Clear all service worker caches
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (!registrationState.registration) {
    return;
  }

  try {
    // Send message to service worker to clear caches
    const messageChannel = new MessageChannel();
    
    return new Promise((resolve) => {
      messageChannel.port1.onmessage = (event) => {
        if (event.data.success) {
          console.log('[SW] Caches cleared');
          resolve();
        }
      };

      registrationState.registration?.active?.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    });
  } catch (error) {
    console.error('[SW] Failed to clear caches:', error);
    // Fallback: clear caches directly
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[SW] Caches cleared (fallback)');
    } catch (fallbackError) {
      console.error('[SW] Fallback cache clear failed:', fallbackError);
    }
  }
}

/**
 * Skip waiting and activate new service worker
 */
export async function skipWaiting(): Promise<void> {
  if (!registrationState.registration?.waiting) {
    return;
  }

  try {
    registrationState.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    // Reload page after skip waiting
    window.location.reload();
  } catch (error) {
    console.error('[SW] Failed to skip waiting:', error);
  }
}

/**
 * Subscribe to update notifications
 */
export function onUpdateAvailable(callback: () => void): () => void {
  updateCallbacks.push(callback);
  
  // Return unsubscribe function
  return () => {
    updateCallbacks = updateCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Notify all update callbacks
 */
function notifyUpdateCallbacks(): void {
  updateCallbacks.forEach(callback => callback());
}

/**
 * Get current registration state
 */
export function getRegistrationState(): ServiceWorkerRegistrationState {
  return { ...registrationState };
}

/**
 * Check if update is available
 */
export function isUpdateAvailable(): boolean {
  return registrationState.updateAvailable;
}
