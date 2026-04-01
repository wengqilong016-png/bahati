import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bahati.driver',
  appName: 'Bahati',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
