// main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Import global styles (affects all components)
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container (#root) not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
