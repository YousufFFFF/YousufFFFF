'use client';

import { RivalClient, type TokenStore } from '@rival/api-client';

/**
 * The browser's API client.
 *
 * Tokens live in `localStorage` so a dashboard session survives a refresh. That
 * is a deliberate trade-off for an internal tool: access tokens are short-lived
 * and rotate, and nothing here is a bearer credential for anything but this
 * API. The token store is an interface precisely so a deployment that wants
 * httpOnly cookies can swap it.
 */

const STORAGE_KEY = 'rival.admin.tokens';

class BrowserTokenStore implements TokenStore {
  async getTokens() {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as { accessToken: string; refreshToken: string }) : null;
    } catch {
      return null;
    }
  }

  async setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
    if (typeof window === 'undefined') return;
    try {
      if (tokens) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing can refuse storage; the session simply won't persist.
    }
  }
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let client: RivalClient | null = null;

export function getClient(onSignedOut?: () => void): RivalClient {
  client ??= new RivalClient({
    baseUrl: API_URL,
    tokens: new BrowserTokenStore(),
    onSignedOut,
  });
  return client;
}

export function formatMinor(minor: number, currency: string): string {
  const symbols: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const amount = (minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${symbols[currency] ?? `${currency} `}${amount}`;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(value: string | null): string {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
