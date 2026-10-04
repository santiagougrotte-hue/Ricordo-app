import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import '@fontsource/gloock/latin-400.css';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/reenie-beanie/latin-400.css';
import './styles/global.css';
import { StoreProvider } from './state/store';
import { App } from './App';

// Versión de un solo archivo (para abrir el .html directo, sin servidor): rutas con #.
const Router = import.meta.env.VITE_SINGLEFILE ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <StoreProvider>
        <App />
      </StoreProvider>
    </Router>
  </StrictMode>,
);
