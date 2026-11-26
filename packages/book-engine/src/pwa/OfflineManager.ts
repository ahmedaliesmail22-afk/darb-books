import {
  normalizeAssetDir,
  normalizeDataFile,
  type EditionMeta,
} from '@darb/book-schema';

export interface OfflineManagerConfig {
  swUrl?: string;
  swScope?: string;
  storagePrefix?: string;
  cachePrefix?: string;
}

export class OfflineManager {
  private swUrl: string;
  private swScope: string;
  private offlineMetaKey: string;
  private cachePrefix: string;

  constructor(config: OfflineManagerConfig = {}) {
    this.swUrl = config.swUrl ?? './sw.js';
    this.swScope = config.swScope ?? './';
    const prefix = config.storagePrefix ?? 'darb_books';
    this.offlineMetaKey = `${prefix}_offline_editions_v1`;
    this.cachePrefix = config.cachePrefix ?? 'darb-edition';
  }

  public async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register(this.swUrl, { scope: this.swScope });
    } catch {
      // ignore on unsupported environments or file://
    }
  }

  private getCacheName(editionId: string): string {
    return `${this.cachePrefix}-${editionId}-v1`;
  }

  private readSavedMap(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(this.offlineMetaKey);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }

  private writeSavedMap(map: Record<string, boolean>): void {
    try {
      localStorage.setItem(this.offlineMetaKey, JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  public async isEditionCached(editionId: string): Promise<boolean> {
    const map = this.readSavedMap();
    if (!map[editionId]) return false;
    if (!('caches' in window)) return false;
    try {
      return await caches.has(this.getCacheName(editionId));
    } catch {
      return false;
    }
  }

  public isEditionMarkedOffline(editionId: string): boolean {
    return Boolean(this.readSavedMap()[editionId]);
  }

  /**
   * تخزين ذكي عند الطلب: يخزن بيانات وصوتيات الكتاب المختار فقط داخل Cache Storage.
   */
  public async cacheEditionForOffline(
    edition: EditionMeta,
    onProgress?: (done: number, total: number) => void
  ): Promise<void> {
    if (!('caches' in window)) {
      throw new Error('المتصفح لا يدعم التخزين المؤقت دون إنترنت');
    }

    const cache = await caches.open(this.getCacheName(edition.id));
    const urls: string[] = [normalizeDataFile(edition.dataFile)];

    const audioDir = normalizeAssetDir(edition.audioDir);
    const tracksCount = Math.max(0, edition.audioTracksCount || edition.spreadsCount || 0);
    for (let i = 0; i < tracksCount; i++) {
      urls.push(`${audioDir}spread_${i}.mp3`);
    }

    const total = urls.length;
    let done = 0;
    onProgress?.(0, total);

    const concurrency = 4;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < urls.length) {
        const idx = cursor++;
        const url = urls[idx];
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) {
          await cache.put(url, res.clone());
        }
        done++;
        onProgress?.(done, total);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const map = this.readSavedMap();
    map[edition.id] = true;
    this.writeSavedMap(map);
  }

  public async removeEditionOfflineCache(editionId: string): Promise<void> {
    if ('caches' in window) {
      await caches.delete(this.getCacheName(editionId));
    }
    const map = this.readSavedMap();
    delete map[editionId];
    this.writeSavedMap(map);
  }
}
