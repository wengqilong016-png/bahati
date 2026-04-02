import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Use relative asset paths for Capacitor builds (`--mode capacitor`) so
  // assets resolve correctly when loaded from file:// / https://localhost.
  // Normal web builds keep the default '/' so BrowserRouter deep-links work.
  base: mode === 'capacitor' ? './' : '/',
}));
