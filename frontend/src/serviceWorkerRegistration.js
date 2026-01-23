// Service Worker Registration for PWA

export function register(config) {
  // PWA requires HTTPS in production (localhost is allowed for development)
  if ('serviceWorker' in navigator) {
    // Wait for window load to avoid impacting page load performance
    window.addEventListener('load', () => {
      const swUrl = `${window.location.origin}/service-worker.js`;

      // Check if the service worker can be found
      fetch(swUrl, { method: 'HEAD' })
        .then((response) => {
          if (response.status === 200) {
            registerValidSW(swUrl, config);
          } else {
            console.warn('Service worker not found at:', swUrl);
          }
        })
        .catch(() => {
          console.log('No internet connection found. App is running in offline mode.');
        });
    });
  } else {
    console.log('Service workers are not supported in this browser.');
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl, { scope: '/' })
    .then((registration) => {
      console.log('Service Worker registered with scope:', registration.scope);
      
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              console.log('New content is available; please refresh.');
              
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              console.log('Content is cached for offline use.');
              
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error);
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
