interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly onEvict?: (key: K, value: V) => void,
  ) {
    this.sweepTimer = setInterval(
      () => this.sweep(),
      Math.max(ttlMs / 2, 5_000),
    );
    this.sweepTimer.unref();
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.onEvict?.(key, entry.value);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value as K | undefined;
      if (oldest !== undefined) {
        const evicted = this.store.get(oldest);
        this.store.delete(oldest);
        if (evicted) this.onEvict?.(oldest, evicted.value);
      }
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): void {
    const entry = this.store.get(key);
    if (entry) {
      this.store.delete(key);
      this.onEvict?.(key, entry.value);
    }
  }

  clear(): void {
    for (const [key, entry] of this.store.entries()) {
      this.onEvict?.(key, entry.value);
    }
    this.store.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
        this.onEvict?.(key, entry.value);
      }
    }
  }

  destroy(): void {
    clearInterval(this.sweepTimer);
    this.clear();
  }
}
