import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Monitor } from 'lucide-react';
import { Button } from '../ui/button';

export const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after a delay if not dismissed before
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50"
        data-testid="install-prompt"
      >
        <div className="bg-card border border-border rounded-2xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Download className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium mb-1">Install MojiChat</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Install our app for a better experience with offline support and notifications
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleInstall}
                  size="sm"
                  className="rounded-full"
                >
                  Install
                </Button>
                <Button 
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                >
                  Not now
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 -mt-1 -mr-1"
              onClick={handleDismiss}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// iOS Install Instructions
export const IOSInstallInstructions = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        exit={{ y: 100 }}
        className="w-full md:w-96 bg-card rounded-t-3xl md:rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-4 md:hidden" />
        
        <h3 className="text-lg font-heading font-bold mb-4 text-center">
          Install on iOS
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary">1</span>
            </div>
            <div>
              <p className="font-medium">Tap the Share button</p>
              <p className="text-sm text-muted-foreground">
                At the bottom of Safari (the square with an arrow)
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary">2</span>
            </div>
            <div>
              <p className="font-medium">Scroll and tap "Add to Home Screen"</p>
              <p className="text-sm text-muted-foreground">
                You may need to scroll down to find it
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary">3</span>
            </div>
            <div>
              <p className="font-medium">Tap "Add"</p>
              <p className="text-sm text-muted-foreground">
                MojiChat will appear on your home screen
              </p>
            </div>
          </div>
        </div>
        
        <Button onClick={onClose} className="w-full mt-6 rounded-full">
          Got it
        </Button>
      </motion.div>
    </motion.div>
  );
};
