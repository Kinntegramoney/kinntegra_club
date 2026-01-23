import { useState, useEffect } from 'react';
import { Download, X, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show banner after a short delay (better UX)
      setTimeout(() => {
        setShowInstallBanner(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const dismissBanner = () => {
    setShowInstallBanner(false);
    // Store in localStorage to not show again for this session
    localStorage.setItem('pwa-banner-dismissed', 'true');
  };

  // Don't show if already installed or dismissed
  if (isInstalled || !showInstallBanner) return null;

  // Check if user dismissed banner in this session
  if (localStorage.getItem('pwa-banner-dismissed') === 'true') return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg shadow-lg p-4 z-50 animate-slide-up">
      <button 
        onClick={dismissBanner}
        className="absolute top-2 right-2 text-white/80 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>
      
      <div className="flex items-start gap-3">
        <div className="bg-white/20 rounded-lg p-2">
          <Monitor className="h-6 w-6" />
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-lg">Install Kinntegraa</h3>
          <p className="text-sm text-white/90 mt-1">
            Install our app for a better experience with offline access and faster loading.
          </p>
          
          <div className="flex gap-2 mt-3">
            <Button 
              onClick={handleInstall}
              className="bg-white text-amber-700 hover:bg-white/90 font-medium"
              size="sm"
            >
              <Download className="h-4 w-4 mr-1" />
              Install App
            </Button>
            <Button 
              onClick={dismissBanner}
              variant="ghost"
              className="text-white/80 hover:text-white hover:bg-white/10"
              size="sm"
            >
              Not Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
