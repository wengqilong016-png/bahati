import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Required for Capacitor: assets must be referenced with relative paths
  // so they resolve correctly when the app is loaded from the local webDir
  // (file:// on Android/iOS).
  base: './',
});
