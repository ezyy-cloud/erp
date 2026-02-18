/**
 * Offline Queue
 * 
 * Manages queuing of write operations when offline using IndexedDB
 * Retries queued operations when network is restored
 */

const DB_NAME = 'ezyy-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'operations';

export interface QueuedOperation {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
  retries: number;
  status: 'pending' | 'processing' | 'failed';
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) {
    return db;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
  });
}

/**
 * Generate unique ID for operation
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Queue an operation for later execution
 */
export async function queueOperation(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | null
): Promise<string> {
  const database = await initDB();
  const id = generateId();

  const operation: QueuedOperation = {
    id,
    url,
    method,
    headers,
    body,
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(operation);

    request.onsuccess = () => {
      console.log('[OfflineQueue] Operation queued:', id);
      resolve(id);
    };

    request.onerror = () => {
      reject(new Error('Failed to queue operation'));
    };
  });
}

/**
 * Get all pending operations
 */
export async function getPendingOperations(): Promise<QueuedOperation[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error('Failed to get pending operations'));
    };
  });
}

/**
 * Update operation status
 */
async function updateOperationStatus(
  id: string,
  status: QueuedOperation['status']
): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const operation = getRequest.result;
      if (operation) {
        operation.status = status;
        if (status === 'processing') {
          operation.retries += 1;
        }
        const putRequest = store.put(operation);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(new Error('Failed to update operation'));
      } else {
        resolve();
      }
    };

    getRequest.onerror = () => {
      reject(new Error('Failed to get operation'));
    };
  });
}

/**
 * Remove operation from queue
 */
export async function removeOperation(id: string): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('[OfflineQueue] Operation removed:', id);
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to remove operation'));
    };
  });
}

/**
 * Retry a queued operation
 */
export async function retryOperation(operation: QueuedOperation): Promise<boolean> {
  // Mark as processing
  await updateOperationStatus(operation.id, 'processing');

  try {
    const response = await fetch(operation.url, {
      method: operation.method,
      headers: operation.headers,
      body: operation.body,
    });

    if (response.ok) {
      // Success - remove from queue
      await removeOperation(operation.id);
      console.log('[OfflineQueue] Operation succeeded:', operation.id);
      return true;
    } else {
      // Failed - mark as failed if too many retries
      if (operation.retries >= 3) {
        await updateOperationStatus(operation.id, 'failed');
        console.warn('[OfflineQueue] Operation failed after retries:', operation.id);
        return false;
      }
      // Reset to pending for retry
      await updateOperationStatus(operation.id, 'pending');
      return false;
    }
  } catch (error) {
    console.error('[OfflineQueue] Retry failed:', error);
    // Reset to pending for retry (unless too many retries)
    if (operation.retries >= 3) {
      await updateOperationStatus(operation.id, 'failed');
      return false;
    }
    await updateOperationStatus(operation.id, 'pending');
    return false;
  }
}

/**
 * Retry all pending operations
 */
export async function retryAllPending(): Promise<{ succeeded: number; failed: number }> {
  const operations = await getPendingOperations();
  let succeeded = 0;
  let failed = 0;

  for (const operation of operations) {
    const success = await retryOperation(operation);
    if (success) {
      succeeded++;
    } else if (operation.retries >= 3) {
      failed++;
    }
  }

  return { succeeded, failed };
}

/**
 * Clear all operations from queue
 */
export async function clearQueue(): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.log('[OfflineQueue] Queue cleared');
      resolve();
    };

    request.onerror = () => {
      reject(new Error('Failed to clear queue'));
    };
  });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  failed: number;
}> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const statusIndex = store.index('status');

    const stats = { pending: 0, processing: 0, failed: 0 };

    const countStatus = (status: string, callback: () => void) => {
      const request = statusIndex.count(status);
      request.onsuccess = () => {
        stats[status as keyof typeof stats] = request.result;
        callback();
      };
      request.onerror = () => reject(new Error(`Failed to count ${status} operations`));
    };

    countStatus('pending', () => {
      countStatus('processing', () => {
        countStatus('failed', () => {
          resolve(stats);
        });
      });
    });
  });
}
