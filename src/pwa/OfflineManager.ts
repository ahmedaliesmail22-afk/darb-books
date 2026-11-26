import type { EditionMeta } from '../types/book';
import { normalizeAssetDir, normalizeDataFile } from '../types/book';

const OFFLINE_META_KEY = 'darb_books_offline_editions_v1';

export class OfflineManager {
  public async registerServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {
      // ignore on unsupported environments or file://
    }
  }

  private getCacheName(editionId: string): string {
    return `darb-edition-${editionId}-v1`;
  }

  private readSavedMap(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(OFFLINE_META_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }

  private writeSavedMap(map: Record<string, boolean>): void {
    try {
      localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(map));
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
