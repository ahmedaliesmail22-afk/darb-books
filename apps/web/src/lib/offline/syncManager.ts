import type { PortalBookItem } from '../types';
import { ApiError, apiRequest, getStoredTokens } from '../apiClient';
import { localDatabase, type SyncQueueItem } from './localDatabase';
import { getNetworkSnapshot, isOnline, subscribeNetworkStatus } from './networkMonitor';

export interface SyncStatusSnapshot {
  online: boolean;
  connectionType: string;
  syncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

type SyncListener = (snapshot: SyncStatusSnapshot) => void;

class OfflineSyncManager {
  private readonly listeners = new Set<SyncListener>();
  private state: SyncStatusSnapshot = {
    online: isOnline(),
    connectionType: getNetworkSnapshot().connectionType,
    syncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
  };
  private flushing = false;
  private initialized = false;
  private apiBaseProvider: () => string | null = () => null;

  init(getApiBase: () => string | null): () => void {
    this.apiBaseProvider = getApiBase;
    if (!this.initialized) {
      this.initialized = true;
      void this.refreshPendingCount();
    }
    const unsubNet = subscribeNetworkStatus((net) => {
      this.updateState({ online: net.connected, connectionType: net.connectionType });
      if (net.connected) {
        const base = this.apiBaseProvider();
        if (base !== null) {
          void this.flushSyncQueue(base);
        }
      }
    });
    return unsubNet;
  }

  getSnapshot(): SyncStatusSnapshot {
    return this.state;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(patch: Partial<SyncStatusSnapshot>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // isolate subscriber errors
      }
    }
  }

  async refreshPendingCount(): Promise<number> {
    const queue = await localDatabase.listSyncQueue();
    this.updateState({ pendingCount: queue.length });
    return queue.length;
  }

  async syncProgress(input: {
    slug: string;
    currentSpread: number;
    percent: number;
    bookmarksJson: unknown[];
    apiBase: string | null;
    isAuthenticated: boolean;
  }): Promise<{ syncedRemotely: boolean; queued: boolean }> {
    await localDatabase.saveProgress({
      bookSlug: input.slug,
      currentSpread: input.currentSpread,
      percent: input.percent,
      bookmarksJson: input.bookmarksJson,
    });

    if (!input.isAuthenticated || input.apiBase === null) {
      return { syncedRemotely: false, queued: false };
    }

    const payload = {
      slug: input.slug,
      currentSpread: input.currentSpread,
      percent: input.percent,
      bookmarksJson: input.bookmarksJson,
    };

    if (isOnline()) {
      try {
        await apiRequest(`/api/v1/books/${encodeURIComponent(input.slug)}/progress`, {
          method: 'PUT',
          apiBase: input.apiBase,
          body: {
            currentSpread: input.currentSpread,
            percent: input.percent,
            bookmarksJson: input.bookmarksJson,
          },
        });
        await localDatabase.removeSyncItem(`PROGRESS_UPSERT:${input.slug}`);
        this.updateState({ lastSyncedAt: new Date().toISOString(), lastError: null });
        await this.refreshPendingCount();
        return { syncedRemotely: true, queued: false };
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
          return { syncedRemotely: false, queued: false };
        }
      }
    }

    await localDatabase.enqueueSync('PROGRESS_UPSERT', payload, input.slug);
    await this.refreshPendingCount();
    return { syncedRemotely: false, queued: true };
  }

  async syncProfileSettings(input: {
    apiBase: string | null;
    body: {
      ageGroupId: string | null;
      educationLevelId: string | null;
      preferredTaxonomyIds: string[];
      uiPrefsJson?: Record<string, unknown>;
    };
  }): Promise<{ queued: boolean }> {
    if (input.apiBase !== null && isOnline()) {
      try {
        await apiRequest('/api/v1/auth/onboarding', {
          method: 'PUT',
          apiBase: input.apiBase,
          body: input.body,
        });
        await localDatabase.removeSyncItem('PROFILE_ONBOARDING_PUT:profile');
        this.updateState({ lastSyncedAt: new Date().toISOString(), lastError: null });
        await this.refreshPendingCount();
        return { queued: false };
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 429) {
          throw err;
        }
      }
    }

    await localDatabase.enqueueSync('PROFILE_ONBOARDING_PUT', input.body, 'profile');
    await this.refreshPendingCount();
    return { queued: true };
  }

  private async executeQueueItem(apiBase: string, item: SyncQueueItem): Promise<void> {
    if (item.operationType === 'PROGRESS_UPSERT') {
      const slug = String(item.payload.slug || '');
      if (!slug) return;
      await apiRequest(`/api/v1/books/${encodeURIComponent(slug)}/progress`, {
        method: 'PUT',
        apiBase,
        body: {
          currentSpread: Number(item.payload.currentSpread ?? 0),
          percent: Number(item.payload.percent ?? 0),
          bookmarksJson: Array.isArray(item.payload.bookmarksJson)
            ? item.payload.bookmarksJson
            : [],
        },
      });
      return;
    }

    if (item.operationType === 'PROFILE_ONBOARDING_PUT') {
      await apiRequest('/api/v1/auth/onboarding', {
        method: 'PUT',
        apiBase,
        body: item.payload,
      });
    }
  }

  async flushSyncQueue(apiBaseOverride?: string | null): Promise<{ synced: number }> {
    const apiBase = apiBaseOverride !== undefined ? apiBaseOverride : this.apiBaseProvider();
    if (this.flushing || apiBase === null || !isOnline() || !getStoredTokens()) {
      await this.refreshPendingCount();
      return { synced: 0 };
    }

    this.flushing = true;
    this.updateState({ syncing: true, lastError: null });
    let synced = 0;

    try {
      const queue = await localDatabase.listSyncQueue();
      for (const item of queue) {
        try {
          await this.executeQueueItem(apiBase, item);
          await localDatabase.removeSyncItem(item.id);
          synced++;
        } catch (err) {
          if (
            err instanceof ApiError &&
            err.status >= 400 &&
            err.status < 500 &&
            err.status !== 401 &&
            err.status !== 429
          ) {
            await localDatabase.removeSyncItem(item.id);
            continue;
          }
          await localDatabase.incrementSyncRetry(item);
          this.updateState({
            lastError: err instanceof Error ? err.message : 'تعذرت المزامنة مع الخادم',
          });
          break;
        }
      }
      if (synced > 0) {
        this.updateState({ lastSyncedAt: new Date().toISOString() });
      }
      return { synced };
    } finally {
      this.flushing = false;
      const remaining = (await localDatabase.listSyncQueue()).length;
      this.updateState({ syncing: false, pendingCount: remaining });
    }
  }

  async cacheCatalogBooks(books: PortalBookItem[]): Promise<void> {
    for (const book of books) {
      await localDatabase.upsertBook(book.slug, book, null);
    }
  }
}

export const syncManager = new OfflineSyncManager();
