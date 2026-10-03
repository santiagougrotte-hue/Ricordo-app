import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/gloock/latin-400.css';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/oswald/latin-500.css';
import '@fontsource/reenie-beanie/latin-400.css';
import './styles/global.css';
import { StoreProvider } from './state/store';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
