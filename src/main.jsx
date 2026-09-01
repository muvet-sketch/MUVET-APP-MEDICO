import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/index.css';
import App from './app/App.jsx';
import ConfiguracionFaltante from './app/ConfiguracionFaltante.jsx';
import { supabaseConfigurado } from './lib/supabase';

// Fase 7, Acción 11: PWA instalable. registerSW no hace nada en dev
// (import.meta.env.DEV) salvo que se fuerce con devOptions — no interfiere
// con el ciclo normal de desarrollo (vite-plugin-pwa solo genera el service
// worker real en el build de producción).
registerSW({ immediate: true });

// Sin credenciales de Supabase la app no tiene backend contra el cual operar:
// cualquier pantalla quedaría a medias. Se corta acá, en el único punto donde
// todavía se puede mostrar algo legible al usuario.
createRoot(document.getElementById('root')).render(
  <StrictMode>{supabaseConfigurado ? <App /> : <ConfiguracionFaltante />}</StrictMode>,
);
