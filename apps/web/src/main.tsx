import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initErrorReporting } from './shared/observability/error-reporting';
import './styles/app.css';

// A failed fetch of the SDK is retried by the next report; nothing to do here.
void initErrorReporting()?.catch(() => undefined);

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
