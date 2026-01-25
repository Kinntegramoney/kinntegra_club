import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CloudOff, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import offlineAPI from '@/utils/offlineAPI';

export default function SyncStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const updateStatus = async () => {
      const status = await offlineAPI.getSyncStatus();
      setIsOnline(status.isOnline);
      setPendingSync(status.pendingSync);
    };

    updateStatus();
    
    // Update status periodically
    const interval = setInterval(updateStatus, 5000);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      updateStatus();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline) return;
    
    setSyncing(true);
    try {
      await offlineAPI.forcSync();
      const status = await offlineAPI.getSyncStatus();
      setPendingSync(status.pendingSync);
    } catch (error) {
      console.error('Sync failed:', error);
    }
    setSyncing(false);
  };

  // Don't show if online and no pending sync
  if (isOnline && pendingSync === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-40">
      {/* Main Status Indicator */}
      <div 
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg cursor-pointer transition-all ${
          isOnline 
            ? pendingSync > 0 
              ? 'bg-etihad-gold-100 text-etihad-gold-800 border border-etihad-gold-300' 
              : 'bg-green-100 text-green-800 border border-green-300'
            : 'bg-red-100 text-red-800 border border-red-300'
        }`}
        onClick={() => setShowDetails(!showDetails)}
      >
        {isOnline ? (
          pendingSync > 0 ? (
            <>
              <CloudOff className="h-4 w-4" />
              <span className="text-sm font-medium">{pendingSync} pending</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              <span className="text-sm font-medium">Synced</span>
            </>
          )
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span className="text-sm font-medium">Offline</span>
          </>
        )}
      </div>

      {/* Details Panel */}
      {showDetails && (
        <div className="absolute bottom-12 right-0 w-64 bg-white rounded-lg shadow-xl border p-4 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-800">Sync Status</h4>
            <button onClick={() => setShowDetails(false)} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-600" />
              )}
              <span className={`text-sm ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                {isOnline ? 'Connected' : 'No Connection'}
              </span>
            </div>

            {/* Pending Sync */}
            {pendingSync > 0 && (
              <div className="bg-etihad-gold-50 p-2 rounded text-sm">
                <div className="font-medium text-etihad-gold-800">
                  {pendingSync} item{pendingSync !== 1 ? 's' : ''} waiting to sync
                </div>
                <p className="text-etihad-gold-600 text-xs mt-1">
                  Data will sync automatically when online
                </p>
              </div>
            )}

            {/* Offline Mode Info */}
            {!isOnline && (
              <div className="bg-blue-50 p-2 rounded text-sm">
                <div className="font-medium text-blue-800">Offline Mode</div>
                <p className="text-blue-600 text-xs mt-1">
                  You can continue working. Changes will sync when you're back online.
                </p>
              </div>
            )}

            {/* Sync Button */}
            {isOnline && pendingSync > 0 && (
              <Button 
                onClick={handleSync} 
                disabled={syncing}
                size="sm"
                className="w-full bg-etihad-gold-600 hover:bg-etihad-gold-700"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Now
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
