/**
 * A small fixed-window limiter, in memory.
 *
 * It protects the endpoints where guessing is the attack — sign-in, password
 * reset, connection requests — without adding a Redis dependency to the MVP.
 * A multi-instance deployment should swap the store for a shared one; the
 * interface is deliberately two methods wide so that is a drop-in change.
 */

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; expiresAt: number }>();

  async hit(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.windows.set(key, { count: 1, expiresAt: now + windowMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  async reset(key: string): Promise<void> {
    this.windows.delete(key);
  }

  /** Wipes every window. Used by tests; never called in normal operation. */
  clear(): void {
    this.windows.clear();
  }

  /** Drops expired windows; called opportunistically so the map cannot grow forever. */
  sweep(): void {
    const now = Date.now();
    for (const [key, window] of this.windows) if (window.expiresAt <= now) this.windows.delete(key);
  }
}

export const rateLimitStore = new MemoryRateLimitStore();

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  connectionRequest: { limit: 30, windowMs: 60 * 60_000 },
  report: { limit: 10, windowMs: 24 * 60 * 60_000 },
  search: { limit: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/** `true` when the caller is still inside the allowance. */
export async function consume(key: string, rule: RateLimitRule): Promise<boolean> {
  const count = await rateLimitStore.hit(key, rule.windowMs);
  return count <= rule.limit;
}
