import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Ask the browser to keep IndexedDB data even under storage pressure (best effort).
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((p) => {
    if (!p) navigator.storage.persist().catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
