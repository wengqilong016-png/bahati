import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Use relative asset paths for Capacitor builds (`--mode capacitor`) so
  // assets resolve correctly when loaded from file:// / https://localhost.
  // Normal web builds keep the default '/' so BrowserRouter deep-links work.
  base: mode === 'capacitor' ? './' : '/',
}));
