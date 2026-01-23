// Offline-First API Wrapper
// Handles API calls with offline support - saves locally first, syncs when online

import offlineDB, { STORES } from './offlineDB';

const API = process.env.REACT_APP_BACKEND_URL;

class OfflineAPI {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      await offlineDB.init();
      this.initialized = true;
      
      // Process any pending sync items
      if (navigator.onLine) {
        offlineDB.processSyncQueue();
      }
    }
  }

  getToken() {
    return localStorage.getItem('token');
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.getToken()}`
    };
  }

  // Generic fetch with offline fallback
  async fetchWithOffline(endpoint, options = {}, cacheKey = null) {
    await this.init();
    
    // Try network first
    if (navigator.onLine) {
      try {
        const response = await fetch(`${API}${endpoint}`, {
          ...options,
          headers: this.getHeaders()
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Cache the response if cacheKey provided
          if (cacheKey && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
            await offlineDB.cacheData(cacheKey, data);
          }
          
          return { data, fromCache: false };
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.warn('Network request failed, trying cache:', error);
      }
    }
    
    // Fallback to cache
    if (cacheKey) {
      const cached = await offlineDB.getCachedData(cacheKey);
      if (cached) {
        return { data: cached, fromCache: true };
      }
    }
    
    throw new Error('No network connection and no cached data available');
  }

  // ============ CLIENTS ============
  
  async getClients() {
    return this.fetchWithOffline('/api/clients', {}, 'clients_list');
  }

  async getClient(clientId) {
    return this.fetchWithOffline(`/api/clients/${clientId}`, {}, `client_${clientId}`);
  }

  async createClient(clientData) {
    await this.init();
    
    // Save locally first
    const localClient = await offlineDB.add(STORES.CLIENTS, clientData);
    
    // If online, sync immediately
    if (navigator.onLine) {
      try {
        const response = await fetch(`${API}/api/clients`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(clientData)
        });
        
        if (response.ok) {
          const serverClient = await response.json();
          // Update local with server ID
          await offlineDB.delete(STORES.CLIENTS, localClient.id);
          serverClient.synced = true;
          await offlineDB.add(STORES.CLIENTS, serverClient);
          return { data: serverClient, synced: true };
        }
      } catch (error) {
        console.warn('Failed to sync client, queued for later:', error);
      }
    }
    
    // Queue for sync
    await offlineDB.addToSyncQueue('create', STORES.CLIENTS, localClient, `${API}/api/clients`);
    return { data: localClient, synced: false };
  }

  // ============ TRADES ============
  
  async getTrades() {
    return this.fetchWithOffline('/api/trades', {}, 'trades_list');
  }

  async createTrade(tradeData) {
    await this.init();
    
    // Save locally first
    const localTrade = await offlineDB.add(STORES.TRADES, tradeData);
    
    // If online, sync immediately
    if (navigator.onLine) {
      try {
        const response = await fetch(`${API}/api/trades`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(tradeData)
        });
        
        if (response.ok) {
          const serverTrade = await response.json();
          await offlineDB.delete(STORES.TRADES, localTrade.id);
          serverTrade.synced = true;
          await offlineDB.add(STORES.TRADES, serverTrade);
          return { data: serverTrade, synced: true };
        }
      } catch (error) {
        console.warn('Failed to sync trade, queued for later:', error);
      }
    }
    
    // Queue for sync
    await offlineDB.addToSyncQueue('create', STORES.TRADES, localTrade, `${API}/api/trades`);
    return { data: localTrade, synced: false };
  }

  // ============ REINVESTMENT TAGGING ============
  
  async getReinvestmentData() {
    return this.fetchWithOffline('/api/reinvestment/upcoming', {}, 'reinvestment_data');
  }

  async tagCashflow(cashflowId, tagData) {
    await this.init();
    
    const endpoint = `${API}/api/reinvestment/tag/${cashflowId}`;
    
    // If online, sync immediately
    if (navigator.onLine) {
      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify(tagData)
        });
        
        if (response.ok) {
          const result = await response.json();
          return { data: result, synced: true };
        }
      } catch (error) {
        console.warn('Failed to sync tag, queued for later:', error);
      }
    }
    
    // Save to local and queue
    const localData = { cashflowId, ...tagData, id: cashflowId };
    await offlineDB.update(STORES.CASHFLOWS, localData);
    await offlineDB.addToSyncQueue('update', STORES.CASHFLOWS, tagData, endpoint);
    
    return { data: localData, synced: false };
  }

  // ============ HOLDINGS ============
  
  async getHoldings() {
    return this.fetchWithOffline('/api/holdings/clients', {}, 'holdings_clients');
  }

  async getClientHoldings(clientId) {
    return this.fetchWithOffline(`/api/holdings/client/${clientId}`, {}, `holdings_${clientId}`);
  }

  // ============ LOGS ============
  
  async getTradeLogs() {
    return this.fetchWithOffline('/api/trades', {}, 'trade_logs');
  }

  // ============ SYNC STATUS ============
  
  async getSyncStatus() {
    await this.init();
    const pendingCount = await offlineDB.getPendingSyncCount();
    return {
      isOnline: navigator.onLine,
      pendingSync: pendingCount,
      lastSync: localStorage.getItem('lastSyncTime')
    };
  }

  async forcSync() {
    if (navigator.onLine) {
      await offlineDB.processSyncQueue();
      localStorage.setItem('lastSyncTime', new Date().toISOString());
    }
  }
}

// Singleton instance
const offlineAPI = new OfflineAPI();

export default offlineAPI;
