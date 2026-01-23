// Offline Database Manager using IndexedDB
// Provides offline-first data storage with sync capability

const DB_NAME = 'kinntegraa_offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  TRADES: 'trades',
  CLIENTS: 'clients',
  CASHFLOWS: 'cashflows',
  SYNC_QUEUE: 'sync_queue',
  CACHED_DATA: 'cached_data'
};

class OfflineDB {
  constructor() {
    this.db = null;
    this.isOnline = navigator.onLine;
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // Initialize the database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains(STORES.TRADES)) {
          const tradesStore = db.createObjectStore(STORES.TRADES, { keyPath: 'id' });
          tradesStore.createIndex('client_id', 'client_id', { unique: false });
          tradesStore.createIndex('status', 'status', { unique: false });
          tradesStore.createIndex('synced', 'synced', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORES.CLIENTS)) {
          const clientsStore = db.createObjectStore(STORES.CLIENTS, { keyPath: 'id' });
          clientsStore.createIndex('name', 'name', { unique: false });
          clientsStore.createIndex('synced', 'synced', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORES.CASHFLOWS)) {
          const cashflowsStore = db.createObjectStore(STORES.CASHFLOWS, { keyPath: 'id' });
          cashflowsStore.createIndex('client_id', 'client_id', { unique: false });
          cashflowsStore.createIndex('synced', 'synced', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
          syncStore.createIndex('type', 'type', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(STORES.CACHED_DATA)) {
          db.createObjectStore(STORES.CACHED_DATA, { keyPath: 'key' });
        }
      };
    });
  }

  // Generic CRUD operations
  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Generate ID if not present
      if (!data.id) {
        data.id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      data.synced = false;
      data.created_offline = true;
      data.created_at = new Date().toISOString();
      
      const request = store.add(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  async update(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      data.synced = false;
      data.updated_at = new Date().toISOString();
      
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Add to sync queue
  async addToSyncQueue(action, storeName, data, endpoint) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      
      const syncItem = {
        action, // 'create', 'update', 'delete'
        storeName,
        data,
        endpoint,
        timestamp: Date.now(),
        retries: 0
      };
      
      const request = store.add(syncItem);
      request.onsuccess = () => resolve(syncItem);
      request.onerror = () => reject(request.error);
    });
  }

  // Process sync queue when online
  async processSyncQueue() {
    if (!this.isOnline) return;
    
    const queue = await this.getAll(STORES.SYNC_QUEUE);
    const token = localStorage.getItem('token');
    
    if (!token || queue.length === 0) return;
    
    console.log(`Processing ${queue.length} items in sync queue...`);
    
    for (const item of queue) {
      try {
        const response = await fetch(item.endpoint, {
          method: item.action === 'delete' ? 'DELETE' : item.action === 'create' ? 'POST' : 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: item.action !== 'delete' ? JSON.stringify(item.data) : undefined
        });
        
        if (response.ok) {
          // Remove from queue on success
          await this.delete(STORES.SYNC_QUEUE, item.id);
          
          // Update local record as synced
          if (item.storeName && item.data?.id) {
            const localItem = await this.get(item.storeName, item.data.id);
            if (localItem) {
              localItem.synced = true;
              await this.update(item.storeName, localItem);
            }
          }
          
          console.log(`Synced: ${item.action} ${item.storeName}`);
        } else {
          console.error(`Sync failed for ${item.action} ${item.storeName}:`, response.status);
          item.retries++;
          if (item.retries < 3) {
            await this.update(STORES.SYNC_QUEUE, item);
          }
        }
      } catch (error) {
        console.error('Sync error:', error);
        item.retries++;
        if (item.retries < 3) {
          await this.update(STORES.SYNC_QUEUE, item);
        }
      }
    }
  }

  // Cache API response data
  async cacheData(key, data, ttl = 3600000) { // Default 1 hour TTL
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORES.CACHED_DATA, 'readwrite');
      const store = transaction.objectStore(STORES.CACHED_DATA);
      
      const cacheItem = {
        key,
        data,
        timestamp: Date.now(),
        expiry: Date.now() + ttl
      };
      
      const request = store.put(cacheItem);
      request.onsuccess = () => resolve(cacheItem);
      request.onerror = () => reject(request.error);
    });
  }

  async getCachedData(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORES.CACHED_DATA, 'readonly');
      const store = transaction.objectStore(STORES.CACHED_DATA);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result && result.expiry > Date.now()) {
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get pending sync count
  async getPendingSyncCount() {
    const queue = await this.getAll(STORES.SYNC_QUEUE);
    return queue.length;
  }

  // Clear all offline data
  async clearAll() {
    const stores = Object.values(STORES);
    for (const storeName of stores) {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
    }
  }
}

// Singleton instance
const offlineDB = new OfflineDB();

export default offlineDB;
export { STORES };
