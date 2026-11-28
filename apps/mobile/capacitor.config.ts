import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.darb.books',
  appName: 'درب للكتب التفاعلية',
  webDir: '../../dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'darb-books',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'التحقق البيومتري لقاعدة درب',
      },
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'التحقق البيومتري لقاعدة درب',
      },
    },
  },
};

export default config;
