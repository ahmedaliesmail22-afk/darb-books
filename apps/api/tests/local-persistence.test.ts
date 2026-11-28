import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startLocalApiServer } from '../src/local';
import {
  buildIsolatedSqlServerUrl,
  dropTestDatabase,
  sqlServerAvailable,
} from './helpers/testHarness';

describe.skipIf(!sqlServerAvailable)('Persistent Local SQL Server Mode (dev:api:local)', () => {
  const tempRoots: string[] = [];
  const tempDbs: Array<{ url: string; dbName: string }> = [];

  afterEach(async () => {
    while (tempDbs.length > 0) {
      const target = tempDbs.pop()!;
      await dropTestDatabase(target.url, target.dbName);
    }
    while (tempRoots.length > 0) {
      const dir = tempRoots.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it(
    'auto-migrates and seeds on first boot, then preserves all edits across restarts without re-seeding',
    async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'darb-local-persist-'));
      tempRoots.push(root);
      const dataDir = path.join(root, '.local-state');
      const storageDir = path.join(root, '.storage');
      const isolated = buildIsolatedSqlServerUrl();
      tempDbs.push(isolated);

      const runtime1 = await startLocalApiServer({
        dataDir,
        storageDir,
        databaseUrl: isolated.url,
        adminEmail: 'local.admin@darb.test',
        adminPassword: 'LocalTestPassword!2026',
      });

      let accessToken = '';
      try {
        expect(runtime1.seededOnBoot).toBe(true);

        const loginRes = await runtime1.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: 'local.admin@darb.test',
            password: 'LocalTestPassword!2026',
          },
        });
        expect(loginRes.statusCode).toBe(200);
        accessToken = (loginRes.json() as { accessToken: string }).accessToken;

        const taxRes = await runtime1.app.inject({
          method: 'POST',
          url: '/api/v1/taxonomies',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            group: 'domain',
            slug: 'persisted-robotics',
            labelAr: 'الروبوتات المحفوظة محلياً',
            sortOrder: 99,
          },
        });
        expect(taxRes.statusCode).toBe(201);

        const cmsRes = await runtime1.app.inject({
          method: 'PUT',
          url: '/api/v1/cms/pages/home/sections/hero',
          headers: { authorization: `Bearer ${accessToken}` },
          payload: {
            titleAr: 'عنوان مستمر عبر إعادة التشغيل',
            contentJson: { badge: 'تجربة محلية محفوظة' },
            sortOrder: 1,
            isVisible: true,
          },
        });
        expect(cmsRes.statusCode).toBe(200);
      } finally {
        await runtime1.close();
      }

      const runtime2 = await startLocalApiServer({
        dataDir,
        storageDir,
        databaseUrl: isolated.url,
        adminEmail: 'local.admin@darb.test',
        adminPassword: 'LocalTestPassword!2026',
      });

      try {
        expect(runtime2.seededOnBoot).toBe(false);

        const meRes = await runtime2.app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { authorization: `Bearer ${accessToken}` },
        });
        expect(meRes.statusCode).toBe(200);

        const bootstrapRes = await runtime2.app.inject({
          method: 'GET',
          url: '/api/v1/public/bootstrap',
        });
        expect(bootstrapRes.statusCode).toBe(200);
        const bootstrap = bootstrapRes.json() as {
          taxonomies: Record<string, Array<{ slug: string; labelAr: string }>>;
          homePage: { sections: Array<{ sectionKey: string; titleAr: string }> } | null;
        };

        expect(
          bootstrap.taxonomies.domain?.some((t) => t.slug === 'persisted-robotics')
        ).toBe(true);
        expect(
          bootstrap.homePage?.sections.find((s) => s.sectionKey === 'hero')?.titleAr
        ).toBe('عنوان مستمر عبر إعادة التشغيل');
      } finally {
        await runtime2.close();
      }
    },
    90_000
  );
});
