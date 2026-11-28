import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { normalizeAssetDir, normalizeDataFile, parseEditionData, type EditionData } from '@darb/book-schema';
import { apiRequest, resolveMediaBaseUrl } from '../apiClient';
import type { PortalBookItem } from '../types';
import { localDatabase } from './localDatabase';
import { isOnline } from './networkMonitor';

const WEB_META_KEY = 'darb_books_offline_editions_v1';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

async function writeNativeFile(relativePath: string, blob: Blob): Promise<void> {
  const buffer = await blob.arrayBuffer();
  await Filesystem.writeFile({
    path: relativePath,
    data: arrayBufferToBase64(buffer),
    directory: Directory.Data,
    recursive: true,
  });
}

function readWebOfflineMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(WEB_META_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function markWebOfflineSlug(slug: string, value: boolean): void {
  try {
    const map = readWebOfflineMap();
    if (value) map[slug] = true;
    else delete map[slug];
    localStorage.setItem(WEB_META_KEY, JSON.stringify(map));
  } catch {
    // ignore quota issues
  }
}

export async function getOfflineCachedSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  const books = await localDatabase.listBooks();
  for (const b of books) {
    if (b.offlineCached) slugs.add(b.slug);
  }
  const webMap = readWebOfflineMap();
  for (const [slug, cached] of Object.entries(webMap)) {
    if (cached) slugs.add(slug);
  }
  return slugs;
}

export async function resolveNativeAudioDirUri(slug: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const folderPath = `offline-books/${slug}/audio`;
    const check = await Filesystem.readdir({ path: folderPath, directory: Directory.Data });
    if (!check.files || check.files.length === 0) return null;
    const uriRes = await Filesystem.getUri({ path: folderPath, directory: Directory.Data });
    const converted = Capacitor.convertFileSrc(uriRes.uri);
    return converted.endsWith('/') ? converted : `${converted}/`;
  } catch {
    return null;
  }
}

export interface OfflineDownloadProgress {
  done: number;
  total: number;
}

export async function downloadBookForOffline(
  book: PortalBookItem,
  apiBase: string | null,
  onProgress?: (p: OfflineDownloadProgress) => void
): Promise<EditionData> {
  let editionData: EditionData | null = null;
  const fallbackDataUrl = normalizeDataFile(book.legacyMeta?.dataFile ?? `./editions/${book.slug}/book.json`);

  if (apiBase !== null && isOnline()) {
    try {
      const raw = await apiRequest<unknown>(
        `/api/v1/books/${encodeURIComponent(book.slug)}/editions-data`,
        { apiBase }
      );
      editionData = parseEditionData(raw);
    } catch {
      // fall through to bundled fallback or local cache
    }
  }

  if (!editionData) {
    const res = await fetch(fallbackDataUrl).catch(() => null);
    if (res && res.ok) {
      editionData = parseEditionData(await res.json());
    }
  }

  if (!editionData) {
    const cached = await localDatabase.getBook(book.slug);
    if (cached?.editionData) {
      editionData = cached.editionData;
    }
  }

  if (!editionData) {
    throw new Error(`تعذر جلب محتوى الكتاب (${book.title}) للتخزين دون إنترنت`);
  }

  const audioDirRaw = book.activeVersion?.audioDir ?? book.legacyMeta?.audioDir ?? '';
  const audioBaseUrl =
    apiBase !== null && audioDirRaw
      ? resolveMediaBaseUrl(audioDirRaw, apiBase)
      : normalizeAssetDir(audioDirRaw);
  const tracksCount =
    book.activeVersion?.audioTracksCount ||
    book.activeVersion?.spreadsCount ||
    editionData.spreads.length ||
    0;

  const assetTargets: Array<{ url: string; nativeRelPath: string }> = [];
  if (audioBaseUrl && tracksCount > 0) {
    for (let i = 0; i < tracksCount; i++) {
      assetTargets.push({
        url: `${audioBaseUrl}spread_${i}.mp3`,
        nativeRelPath: `offline-books/${book.slug}/audio/spread_${i}.mp3`,
      });
    }
  }

  if (book.coverUrl) {
    assetTargets.push({
      url: book.coverUrl,
      nativeRelPath: `offline-books/${book.slug}/cover.img`,
    });
  }

  const total = assetTargets.length + 1;
  let done = 0;
  onProgress?.({ done: 0, total });

  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: `offline-books/${book.slug}/book.json`,
      data: JSON.stringify(editionData),
      directory: Directory.Data,
      recursive: true,
    });
    done++;
    onProgress?.({ done, total });

    for (const target of assetTargets) {
      try {
        const res = await fetch(target.url);
        if (res.ok) {
          await writeNativeFile(target.nativeRelPath, await res.blob());
        }
      } catch {
        // continue gracefully if optional track doesn't exist
      } finally {
        done++;
        onProgress?.({ done, total });
      }
    }
  } else {
    if ('caches' in window) {
      const cache = await caches.open(`darb-edition-${book.slug}-v1`);
      const jsonBlob = new Blob([JSON.stringify(editionData)], { type: 'application/json' });
      await cache.put(
        fallbackDataUrl,
        new Response(jsonBlob, { headers: { 'Content-Type': 'application/json' } })
      );
      done++;
      onProgress?.({ done, total });

      const concurrency = 4;
      let cursor = 0;
      const worker = async () => {
        while (cursor < assetTargets.length) {
          const item = assetTargets[cursor++];
          try {
            const res = await fetch(item.url);
            if (res.ok) {
              await cache.put(item.url, res.clone());
            }
          } catch {
            // ignore optional media miss
          } finally {
            done++;
            onProgress?.({ done, total });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, assetTargets.length) }, () => worker())
      );
    } else {
      onProgress?.({ done: total, total });
    }
    markWebOfflineSlug(book.slug, true);
  }

  await localDatabase.upsertBook(book.slug, book, editionData, true);
  return editionData;
}
