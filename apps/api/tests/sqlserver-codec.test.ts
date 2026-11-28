import { describe, expect, it } from 'vitest';
import type { Taxonomy } from '@prisma/client';
import {
  parseJson,
  parseNullableJson,
  stringifyJson,
  stringifyNullableJson,
} from '../src/lib/jsonCodec';
import { parseSqlServerConfig } from '../src/lib/sqlServerConfig';
import { isBookAllowedForAgeGroup, resolveBookMinAge } from '../src/services/ageGating';
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from '../src/services/security';

describe('SQL Server codecs, connection parser, and age gating unit tests', () => {
  it('roundtrips UTF-8 Arabic JSON objects and nullable JSON cleanly', () => {
    const sample = {
      title: 'منصة درب للكتب التفاعلية',
      tags: ['رياضيات', 'علوم'],
      nested: { strictAgeGating: true, maxMb: 100 },
    };
    const encoded = stringifyJson(sample);
    expect(typeof encoded).toBe('string');
    expect(parseJson(encoded, {})).toEqual(sample);

    expect(stringifyJson(undefined, '{"empty":true}')).toBe('{"empty":true}');
    expect(parseJson('not-valid-json', { fallback: 1 })).toEqual({ fallback: 1 });
    expect(stringifyNullableJson(null)).toBeNull();
    expect(stringifyNullableJson(undefined)).toBeNull();
    expect(parseNullableJson(null)).toBeNull();
    expect(parseNullableJson(stringifyNullableJson({ ok: true }))).toEqual({ ok: true });
  });

  it('parses ADO sqlserver://, named SQLEXPRESS instances, and mssql:// URIs cleanly', () => {
    const ado = parseSqlServerConfig(
      'sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=Secret!123;encrypt=false;trustServerCertificate=true'
    );
    expect(ado.server).toBe('127.0.0.1');
    expect(ado.port).toBe(1433);
    expect(ado.database).toBe('darb_books');
    expect(ado.user).toBe('darb');
    expect(ado.password).toBe('Secret!123');
    expect(ado.options?.encrypt).toBe(false);
    expect(ado.options?.trustServerCertificate).toBe(true);

    const masterOverride = parseSqlServerConfig(
      'sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=Secret!123',
      'master'
    );
    expect(masterOverride.database).toBe('master');

    const uri = parseSqlServerConfig(
      'mssql://sa:Pass%21word@db.example.local:1433/darb_prod?encrypt=true&trustServerCertificate=false'
    );
    expect(uri.server).toBe('db.example.local');
    expect(uri.port).toBe(1433);
    expect(uri.database).toBe('darb_prod');
    expect(uri.user).toBe('sa');
    expect(uri.password).toBe('Pass!word');
    expect(uri.options?.encrypt).toBe(true);
    expect(uri.options?.trustServerCertificate).toBe(false);

    const named = parseSqlServerConfig(
      'sqlserver://localhost\\SQLEXPRESS;database=darb_books;user=darb;password=pw'
    );
    expect(named.server).toBe('localhost');
    expect(named.options?.instanceName).toBe('SQLEXPRESS');
  });

  it('evaluates age-gating rules accurately from SQL Server String-encoded rulesJson', () => {
    const makeTaxonomy = (slug: string, rulesObj: Record<string, unknown>): Taxonomy => ({
      id: `tax-${slug}`,
      group: 'age_group',
      slug,
      labelAr: slug,
      labelEn: slug,
      description: null,
      parentId: null,
      sortOrder: 0,
      isActive: true,
      rulesJson: stringifyJson(rulesObj),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const policy = { strictAgeGating: true, unratedBookMinAge: 0, enforceForGuests: true };
    const bookKids = makeTaxonomy('kids-6-11', { minAge: 6, maxAge: 11 });
    const bookAdults = makeTaxonomy('adults-18', { minAge: 18, maxAge: null });
    const userChild = makeTaxonomy('child', { minAge: 6, maxAge: 11 });
    const userAdult = makeTaxonomy('adult', { minAge: 18, maxAge: null });

    expect(resolveBookMinAge([bookAdults], policy)).toBe(18);
    expect(isBookAllowedForAgeGroup([bookAdults], userChild, policy)).toBe(false);
    expect(isBookAllowedForAgeGroup([bookKids], userChild, policy)).toBe(true);
    expect(isBookAllowedForAgeGroup([bookAdults], userAdult, policy)).toBe(true);
  });

  it('hashes/verifies passwords and signs/verifies access JWTs consistently', async () => {
    const hash = await hashPassword('DarbPassword!2026');
    expect(await verifyPassword('DarbPassword!2026', hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);

    const secretEnv = {
      JWT_ACCESS_SECRET: 'super-secret-signing-key-32-chars!!',
      JWT_ACCESS_TTL_SEC: 300,
    };
    const token = await signAccessToken(
      {
        userId: 'u-1',
        email: 'test@darb.local',
      },
      secretEnv
    );
    const verified = await verifyAccessToken(token, secretEnv);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe('u-1');
    expect(verified?.email).toBe('test@darb.local');
  });
});
