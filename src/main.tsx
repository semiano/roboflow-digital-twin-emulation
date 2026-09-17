import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { debugLogging } from '@/config/simulation.config';
import { logger } from '@/core/Logger';
import '@/styles/global.css';

logger.setLevel(debugLogging ? 'debug' : 'info');

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

// StrictMode is deliberately omitted: double-mounting would create two WebGL contexts.
createRoot(container).render(<App />);
