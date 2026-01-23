import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA functionality
serviceWorkerRegistration.register({
  onSuccess: () => {
    console.log('Kinntegraa PWA is ready for offline use!');
  },
  onUpdate: (registration) => {
    console.log('New version available! Refresh to update.');
    // Optionally show a toast notification to the user
    if (window.confirm('A new version of Kinntegraa is available. Reload to update?')) {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  }
});

