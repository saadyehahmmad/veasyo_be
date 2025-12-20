import logger from './logger';

/**
 * Cache entry with TTL (Time To Live)
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

/**
 * Cache manager with TTL and size limits
 * Prevents memory leaks by automatically evicting expired entries
 */
export class CacheManager<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private defaultTTL: number; // in milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * @param maxSize Maximum number of entries per cache (0 = unlimited)
   * @param defaultTTL Default TTL in milliseconds (0 = no expiration)
   * @param cleanupInterval Cleanup interval in milliseconds (0 = no automatic cleanup)
   */
  constructor(maxSize = 0, defaultTTL = 0, cleanupInterval = 60000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;

    // Start automatic cleanup if interval is set
    if (cleanupInterval > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, cleanupInterval);
    }
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = ttl ? Date.now() + ttl : this.defaultTTL ? Date.now() + this.defaultTTL : 0;

    // If max size is set and cache is full, evict oldest entry
    if (this.maxSize > 0 && this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
    });
  }

  /**
   * Get a value from the cache
   * Returns undefined if key doesn't exist or entry has expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values (non-expired)
   */
  values(): T[] {
    const values: T[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt === 0 || Date.now() <= entry.expiresAt) {
        values.push(entry.value);
      } else {
        // Remove expired entry
        this.cache.delete(key);
      }
    }
    return values;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    expired: number;
    oldestAge: number;
    newestAge: number;
  } {
    const now = Date.now();
    let expired = 0;
    let oldestAge = 0;
    let newestAge = 0;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        expired++;
      } else {
        const age = now - entry.createdAt;
        if (oldestAge === 0 || age > oldestAge) {
          oldestAge = age;
        }
        if (newestAge === 0 || age < newestAge) {
          newestAge = age;
        }
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired,
      oldestAge,
      newestAge,
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * Evict oldest entry (FIFO)
   */
  private evictOldest(): void {
    if (this.cache.size === 0) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Cache eviction: removed oldest entry ${oldestKey}`);
    }
  }

  /**
   * Destroy the cache manager and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

/**
 * Multi-level cache manager (per tenant)
 * Manages multiple CacheManager instances, one per tenant
 */
export class MultiTenantCacheManager<T> {
  private caches = new Map<string, CacheManager<T>>();
  private maxSizePerTenant: number;
  private defaultTTL: number;
  private cleanupInterval: number;

  /**
   * @param maxSizePerTenant Maximum entries per tenant (0 = unlimited)
   * @param defaultTTL Default TTL in milliseconds
   * @param cleanupInterval Cleanup interval in milliseconds
   */
  constructor(maxSizePerTenant = 1000, defaultTTL = 3600000, cleanupInterval = 60000) {
    this.maxSizePerTenant = maxSizePerTenant;
    this.defaultTTL = defaultTTL;
    this.cleanupInterval = cleanupInterval;
  }

  /**
   * Get or create cache for a tenant
   */
  private getTenantCache(tenantId: string): CacheManager<T> {
    if (!this.caches.has(tenantId)) {
      this.caches.set(
        tenantId,
        new CacheManager<T>(this.maxSizePerTenant, this.defaultTTL, this.cleanupInterval),
      );
    }
    return this.caches.get(tenantId)!;
  }

  /**
   * Set a value for a tenant
   */
  set(tenantId: string, key: string, value: T, ttl?: number): void {
    this.getTenantCache(tenantId).set(key, value, ttl);
  }

  /**
   * Get a value for a tenant
   */
  get(tenantId: string, key: string): T | undefined {
    return this.getTenantCache(tenantId).get(key);
  }

  /**
   * Check if key exists for a tenant
   */
  has(tenantId: string, key: string): boolean {
    return this.getTenantCache(tenantId).has(key);
  }

  /**
   * Delete a key for a tenant
   */
  delete(tenantId: string, key: string): boolean {
    const cache = this.caches.get(tenantId);
    if (!cache) {
      return false;
    }
    return cache.delete(key);
  }

  /**
   * Clear cache for a tenant
   */
  clearTenant(tenantId: string): void {
    const cache = this.caches.get(tenantId);
    if (cache) {
      cache.clear();
      this.caches.delete(tenantId);
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }

  /**
   * Get cache for a tenant (for direct access)
   */
  getCache(tenantId: string): CacheManager<T> {
    return this.getTenantCache(tenantId);
  }

  /**
   * Get statistics for all tenants
   */
  getStats(): {
    tenantCount: number;
    totalEntries: number;
    tenants: Array<{ tenantId: string; stats: ReturnType<CacheManager<T>['getStats']> }>;
  } {
    const tenants: Array<{ tenantId: string; stats: ReturnType<CacheManager<T>['getStats']> }> = [];
    let totalEntries = 0;

    for (const [tenantId, cache] of this.caches.entries()) {
      const stats = cache.getStats();
      tenants.push({ tenantId, stats });
      totalEntries += stats.size;
    }

    return {
      tenantCount: this.caches.size,
      totalEntries,
      tenants,
    };
  }
}

