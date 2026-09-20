import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { RivalClient, type TokenStore } from '@rival/api-client';

/**
 * The app's API client.
 *
 * Tokens go in the device keychain (`expo-secure-store`), never in plain
 * AsyncStorage — a refresh token is a long-lived credential. The web build has
 * no keychain, so it falls back to localStorage, which is only used for
 * development previews.
 */

const KEY = 'rival.session';

class DeviceTokenStore implements TokenStore {
  async getTokens() {
    try {
      const raw =
        Platform.OS === 'web'
          ? globalThis.localStorage?.getItem(KEY)
          : await SecureStore.getItemAsync(KEY);
      return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string }) : null;
    } catch {
      return null;
    }
  }

  async setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
    try {
      if (Platform.OS === 'web') {
        if (tokens) globalThis.localStorage?.setItem(KEY, JSON.stringify(tokens));
        else globalThis.localStorage?.removeItem(KEY);
        return;
      }
      if (tokens) await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      // A locked keychain means the session will not persist; signing in again
      // is the worst case, so this is not worth failing the request over.
    }
  }
}

function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (fromConfig) return fromConfig;
  return 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

const store = new DeviceTokenStore();
let signedOutHandler: (() => void) | null = null;

export const api = new RivalClient({
  baseUrl: API_URL,
  tokens: store,
  onSignedOut: () => signedOutHandler?.(),
});

export function onSignedOut(handler: () => void): void {
  signedOutHandler = handler;
}

export async function hasStoredSession(): Promise<boolean> {
  return (await store.getTokens()) !== null;
}
