import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/index.css';
import App from './app/App.jsx';

// Fase 7, Acción 11: PWA instalable. registerSW no hace nada en dev
// (import.meta.env.DEV) salvo que se fuerce con devOptions — no interfiere
// con el ciclo normal de desarrollo (vite-plugin-pwa solo genera el service
// worker real en el build de producción).
registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
