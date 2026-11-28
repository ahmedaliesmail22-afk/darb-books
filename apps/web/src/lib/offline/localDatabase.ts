import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { normalizeDataFile, parseCatalogData, parseEditionData, type EditionData } from '@darb/book-schema';
import type { PortalBookItem, PortalUser } from '../types';

export interface LocalBookRecord {
  slug: string;
  metadata: PortalBookItem;
  editionData: EditionData | null;
  offlineCached: boolean;
  updatedAt: string;
}

export interface LocalProgressRecord {
  bookSlug: string;
  currentSpread: number;
  percent: number;
  bookmarksJson: unknown[];
  updatedAt: string;
}

export type SyncOperationType = 'PROGRESS_UPSERT' | 'PROFILE_ONBOARDING_PUT';

export interface SyncQueueItem {
  id: string;
  operationType: SyncOperationType;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

const DB_NAME = 'darb_books_offline_db';
const IDB_NAME = 'darb_books_local_v1';
const IDB_VERSION = 1;

const STORES = {
  books: 'books',
  progress: 'reading_progress',
  session: 'user_session',
  queue: 'sync_queue',
} as const;

interface StoreAdapter {
  init(): Promise<void>;
  getAll<T>(store: string): Promise<T[]>;
  getByKey<T>(store: string, key: string): Promise<T | null>;
  put(store: string, key: string, row: Record<string, unknown>): Promise<void>;
  remove(store: string, key: string): Promise<void>;
  clearStore(store: string): Promise<void>;
}

class MemoryStoreAdapter implements StoreAdapter {
  private readonly maps = new Map<string, Map<string, Record<string, unknown>>>();

  async init(): Promise<void> {
    for (const s of Object.values(STORES)) {
      if (!this.maps.has(s)) this.maps.set(s, new Map());
    }
  }

  async getAll<T>(store: string): Promise<T[]> {
    return Array.from(this.maps.get(store)?.values() ?? []) as T[];
  }

  async getByKey<T>(store: string, key: string): Promise<T | null> {
    return (this.maps.get(store)?.get(key) as T | undefined) ?? null;
  }

  async put(store: string, key: string, row: Record<string, unknown>): Promise<void> {
    if (!this.maps.has(store)) this.maps.set(store, new Map());
    this.maps.get(store)!.set(key, row);
  }

  async remove(store: string, key: string): Promise<void> {
    this.maps.get(store)?.delete(key);
  }

  async clearStore(store: string): Promise<void> {
    this.maps.get(store)?.clear();
  }
}

class IndexedDbAdapter implements StoreAdapter {
  private db: IDBDatabase | null = null;
  private readonly memoryFallback = new MemoryStoreAdapter();

  async init(): Promise<void> {
    if (this.db) return;
    if (typeof indexedDB === 'undefined') {
      await this.memoryFallback.init();
      return;
    }
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const database = req.result;
          if (!database.objectStoreNames.contains(STORES.books)) {
            database.createObjectStore(STORES.books, { keyPath: 'slug' });
          }
          if (!database.objectStoreNames.contains(STORES.progress)) {
            database.createObjectStore(STORES.progress, { keyPath: 'bookSlug' });
          }
          if (!database.objectStoreNames.contains(STORES.session)) {
            database.createObjectStore(STORES.session, { keyPath: 'id' });
          }
          if (!database.objectStoreNames.contains(STORES.queue)) {
            database.createObjectStore(STORES.queue, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.db = null;
      await this.memoryFallback.init();
    }
  }

  async getAll<T>(store: string): Promise<T[]> {
    if (!this.db) return this.memoryFallback.getAll<T>(store);
    return new Promise<T[]>((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as T[]);
      req.onerror = () => reject(req.error);
    });
  }

  async getByKey<T>(store: string, key: string): Promise<T | null> {
    if (!this.db) return this.memoryFallback.getByKey<T>(store, key);
    return new Promise<T | null>((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(store: string, _key: string, row: Record<string, unknown>): Promise<void> {
    if (!this.db) return this.memoryFallback.put(store, _key, row);
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readwrite');
      tx.objectStore(store).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(store: string, key: string): Promise<void> {
    if (!this.db) return this.memoryFallback.remove(store, key);
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearStore(store: string): Promise<void> {
    if (!this.db) return this.memoryFallback.clearStore(store);
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

class CapacitorSqliteAdapter implements StoreAdapter {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    const isConn = await this.sqlite.isConnection(DB_NAME, false);
    this.db = isConn.result
      ? await this.sqlite.retrieveConnection(DB_NAME, false)
      : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await this.db.open();

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS books (
        slug TEXT PRIMARY KEY NOT NULL,
        metadata_json TEXT NOT NULL,
        edition_data_json TEXT,
        offline_cached INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS reading_progress (
        book_slug TEXT PRIMARY KEY NOT NULL,
        current_spread INTEGER NOT NULL DEFAULT 0,
        percent REAL NOT NULL DEFAULT 0,
        bookmarks_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_session (
        id TEXT PRIMARY KEY NOT NULL,
        user_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY NOT NULL,
        operation_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  async getAll<T>(store: string): Promise<T[]> {
    await this.init();
    const res = await this.db!.query(`SELECT * FROM ${store};`);
    return ((res.values ?? []) as Array<Record<string, unknown>>).map((row) =>
      this.mapSqliteRow(store, row)
    ) as T[];
  }

  async getByKey<T>(store: string, key: string): Promise<T | null> {
    await this.init();
    const pkCol = store === STORES.books ? 'slug' : store === STORES.progress ? 'book_slug' : 'id';
    const res = await this.db!.query(`SELECT * FROM ${store} WHERE ${pkCol} = ? LIMIT 1;`, [key]);
    const row = (res.values ?? [])[0] as Record<string, unknown> | undefined;
    return row ? (this.mapSqliteRow(store, row) as T) : null;
  }

  private mapSqliteRow(store: string, row: Record<string, unknown>): Record<string, unknown> {
    if (store === STORES.books) {
      return {
        slug: row.slug,
        metadata: JSON.parse(String(row.metadata_json || '{}')),
        editionData: row.edition_data_json ? JSON.parse(String(row.edition_data_json)) : null,
        offlineCached: Boolean(row.offline_cached),
        updatedAt: row.updated_at,
      };
    }
    if (store === STORES.progress) {
      return {
        bookSlug: row.book_slug,
        currentSpread: Number(row.current_spread ?? 0),
        percent: Number(row.percent ?? 0),
        bookmarksJson: JSON.parse(String(row.bookmarks_json || '[]')),
        updatedAt: row.updated_at,
      };
    }
    if (store === STORES.session) {
      return {
        id: row.id,
        user: JSON.parse(String(row.user_json || 'null')),
        updatedAt: row.updated_at,
      };
    }
    return {
      id: row.id,
      operationType: row.operation_type,
      payload: JSON.parse(String(row.payload_json || '{}')),
      createdAt: row.created_at,
      retryCount: Number(row.retry_count ?? 0),
    };
  }

  async put(store: string, _key: string, row: Record<string, unknown>): Promise<void> {
    await this.init();
    if (store === STORES.books) {
      await this.db!.run(
        `INSERT OR REPLACE INTO books (slug, metadata_json, edition_data_json, offline_cached, updated_at) VALUES (?, ?, ?, ?, ?);`,
        [
          row.slug,
          JSON.stringify(row.metadata ?? {}),
          row.editionData ? JSON.stringify(row.editionData) : null,
          row.offlineCached ? 1 : 0,
          row.updatedAt ?? new Date().toISOString(),
        ]
      );
      return;
    }
    if (store === STORES.progress) {
      await this.db!.run(
        `INSERT OR REPLACE INTO reading_progress (book_slug, current_spread, percent, bookmarks_json, updated_at) VALUES (?, ?, ?, ?, ?);`,
        [
          row.bookSlug,
          row.currentSpread ?? 0,
          row.percent ?? 0,
          JSON.stringify(row.bookmarksJson ?? []),
          row.updatedAt ?? new Date().toISOString(),
        ]
      );
      return;
    }
    if (store === STORES.session) {
      await this.db!.run(
        `INSERT OR REPLACE INTO user_session (id, user_json, updated_at) VALUES (?, ?, ?);`,
        [row.id, JSON.stringify(row.user ?? null), row.updatedAt ?? new Date().toISOString()]
      );
      return;
    }
    await this.db!.run(
      `INSERT OR REPLACE INTO sync_queue (id, operation_type, payload_json, created_at, retry_count) VALUES (?, ?, ?, ?, ?);`,
      [
        row.id,
        row.operationType,
        JSON.stringify(row.payload ?? {}),
        row.createdAt ?? new Date().toISOString(),
        row.retryCount ?? 0,
      ]
    );
  }

  async remove(store: string, key: string): Promise<void> {
    await this.init();
    const pkCol = store === STORES.books ? 'slug' : store === STORES.progress ? 'book_slug' : 'id';
    await this.db!.run(`DELETE FROM ${store} WHERE ${pkCol} = ?;`, [key]);
  }

  async clearStore(store: string): Promise<void> {
    await this.init();
    await this.db!.run(`DELETE FROM ${store};`);
  }
}

class LocalOfflineDatabase {
  private readonly adapter: StoreAdapter = Capacitor.isNativePlatform()
    ? new CapacitorSqliteAdapter()
    : new IndexedDbAdapter();
  private initPromise: Promise<void> | null = null;
  private bundledSeeded = false;

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.adapter.init().catch(async () => {
        // Fallback safety so web views never crash
      });
    }
    return this.initPromise;
  }

  async seedBundledEditionsIfNeeded(): Promise<void> {
    await this.init();
    if (this.bundledSeeded) return;
    this.bundledSeeded = true;

    try {
      const existing = await this.adapter.getAll<LocalBookRecord>(STORES.books);
      const existingSlugs = new Set(existing.map((b) => b.slug));

      const catRes = await fetch('./editions/catalog.json');
      if (!catRes.ok) return;
      const catalog = parseCatalogData(await catRes.json());

      for (const ed of catalog.editions) {
        if (existingSlugs.has(ed.id)) continue;
        let parsedEdition: EditionData | null = null;
        try {
          const dataRes = await fetch(normalizeDataFile(ed.dataFile));
          if (dataRes.ok) {
            parsedEdition = parseEditionData(await dataRes.json());
          }
        } catch {
          // keep metadata even if data fetch fails
        }

        const metadata: PortalBookItem = {
          id: ed.id,
          slug: ed.id,
          title: ed.title,
          subtitle: ed.subtitle,
          description: ed.description,
          badge: ed.badge,
          badgeColor: ed.badgeColor,
          theme: ed.theme,
          direction: 'rtl',
          coverUrl: ed.coverUrl ?? null,
          minAge: 0,
          isRecommended: false,
          matchScore: 0,
          taxonomies: [],
          activeVersion: {
            id: ed.id,
            versionNumber: 1,
            versionLabel: 'v1',
            audioDir: ed.audioDir,
            videoDir: ed.videoDir,
            chaptersCount: ed.chaptersCount,
            spreadsCount: ed.spreadsCount,
            audioTracksCount: ed.audioTracksCount,
            videosCount: ed.videosCount,
          },
          legacyMeta: ed,
        };

        await this.upsertBook(ed.id, metadata, parsedEdition, false);
      }
    } catch {
      // ignore background seed errors
    }
  }

  async upsertBook(
    slug: string,
    metadata: PortalBookItem,
    editionData: EditionData | null,
    offlineCached?: boolean
  ): Promise<void> {
    await this.init();
    const prev = await this.adapter.getByKey<LocalBookRecord>(STORES.books, slug);
    const next: LocalBookRecord = {
      slug,
      metadata,
      editionData: editionData ?? prev?.editionData ?? null,
      offlineCached: offlineCached !== undefined ? offlineCached : prev?.offlineCached ?? false,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put(STORES.books, slug, next as unknown as Record<string, unknown>);
  }

  async getBook(slug: string): Promise<LocalBookRecord | null> {
    await this.init();
    return this.adapter.getByKey<LocalBookRecord>(STORES.books, slug);
  }

  async listBooks(): Promise<LocalBookRecord[]> {
    await this.init();
    return this.adapter.getAll<LocalBookRecord>(STORES.books);
  }

  async saveProgress(record: Omit<LocalProgressRecord, 'updatedAt'>): Promise<LocalProgressRecord> {
    await this.init();
    const full: LocalProgressRecord = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put(
      STORES.progress,
      record.bookSlug,
      full as unknown as Record<string, unknown>
    );
    return full;
  }

  async getProgress(bookSlug: string): Promise<LocalProgressRecord | null> {
    await this.init();
    return this.adapter.getByKey<LocalProgressRecord>(STORES.progress, bookSlug);
  }

  async getAllProgressMap(): Promise<Record<string, LocalProgressRecord>> {
    await this.init();
    const rows = await this.adapter.getAll<LocalProgressRecord>(STORES.progress);
    const map: Record<string, LocalProgressRecord> = {};
    for (const r of rows) {
      map[r.bookSlug] = r;
    }
    return map;
  }

  async saveUserSnapshot(user: PortalUser): Promise<void> {
    await this.init();
    await this.adapter.put(STORES.session, 'current', {
      id: 'current',
      user,
      updatedAt: new Date().toISOString(),
    });
  }

  async getUserSnapshot(): Promise<PortalUser | null> {
    await this.init();
    const row = await this.adapter.getByKey<{ id: string; user: PortalUser | null }>(
      STORES.session,
      'current'
    );
    return row?.user ?? null;
  }

  async clearUserSnapshot(): Promise<void> {
    await this.init();
    await this.adapter.remove(STORES.session, 'current');
  }

  async enqueueSync(
    operationType: SyncOperationType,
    payload: Record<string, unknown>,
    dedupeKey?: string
  ): Promise<SyncQueueItem> {
    await this.init();
    const id = dedupeKey
      ? `${operationType}:${dedupeKey}`
      : `${operationType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const item: SyncQueueItem = {
      id,
      operationType,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    await this.adapter.put(STORES.queue, id, item as unknown as Record<string, unknown>);
    return item;
  }

  async listSyncQueue(): Promise<SyncQueueItem[]> {
    await this.init();
    const rows = await this.adapter.getAll<SyncQueueItem>(STORES.queue);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async removeSyncItem(id: string): Promise<void> {
    await this.init();
    await this.adapter.remove(STORES.queue, id);
  }

  async incrementSyncRetry(item: SyncQueueItem): Promise<void> {
    await this.init();
    await this.adapter.put(STORES.queue, item.id, {
      ...item,
      retryCount: item.retryCount + 1,
    });
  }

  async clearAllAccountState(): Promise<void> {
    await this.init();
    await this.adapter.clearStore(STORES.session);
    await this.adapter.clearStore(STORES.progress);
    await this.adapter.clearStore(STORES.queue);
  }
}

export const localDatabase = new LocalOfflineDatabase();
