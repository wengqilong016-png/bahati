import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartkiosk.driver',
  appName: 'SmartKiosk Driver',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
