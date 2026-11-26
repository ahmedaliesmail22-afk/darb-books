import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppEnv } from '../env';

export interface StorageStreamResult {
  status: 200 | 206 | 416;
  stream?: Readable;
  contentType: string;
  contentLength: number;
  totalLength: number;
  contentRange?: string;
}

export interface StorageObjectHead {
  size: number;
  contentType: string;
  eTag?: string;
}

export interface StorageService {
  driver: 'local' | 'r2';
  putObject(input: { key: string; body: Buffer | Uint8Array; contentType: string }): Promise<void>;
  headObject(key: string): Promise<StorageObjectHead | null>;
  getObjectStream(key: string, rangeHeader?: string): Promise<StorageStreamResult | null>;
  createUploadPresignedUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ driver: 'local' | 'r2'; key: string; uploadUrl: string; publicUrl?: string }>;
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
};

export function inferMimeType(key: string, fallback = 'application/octet-stream'): string {
  const ext = path.extname(key).toLowerCase();
  return MIME_BY_EXT[ext] ?? fallback;
}

export function sanitizeStorageKey(rawKey: string): string {
  const normalized = rawKey.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('\0')) {
    throw new Error('Invalid storage key');
  }
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === '.' || s === '..')) {
    throw new Error('Unsafe storage key traversal');
  }
  return segments.join('/');
}

export function parseByteRange(
  rangeHeader: string | undefined,
  totalLength: number
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!rangeHeader) return null;
  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) return null;
  const spec = trimmed.slice('bytes='.length).split(',')[0]?.trim() ?? '';
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) return 'unsatisfiable';

  const [, startStr, endStr] = match;
  if (!startStr && !endStr) return 'unsatisfiable';

  let start: number;
  let end: number;

  if (!startStr) {
    // Suffix range: bytes=-500
    const suffixLen = Number(endStr);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return 'unsatisfiable';
    start = Math.max(0, totalLength - suffixLen);
    end = totalLength - 1;
  } else {
    start = Number(startStr);
    end = endStr ? Math.min(Number(endStr), totalLength - 1) : totalLength - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= totalLength ||
    start > end
  ) {
    return 'unsatisfiable';
  }

  return { start, end };
}

class LocalStorageService implements StorageService {
  public readonly driver = 'local' as const;
  private readonly rootDir: string;
  private readonly fallbackDir?: string;

  constructor(rootDir: string, fallbackDir?: string) {
    this.rootDir = path.resolve(rootDir);
    this.fallbackDir = fallbackDir ? path.resolve(fallbackDir) : undefined;
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  private resolveWritePath(key: string): string {
    const safeKey = sanitizeStorageKey(key);
    const full = path.resolve(this.rootDir, safeKey);
    if (!full.startsWith(this.rootDir + path.sep) && full !== this.rootDir) {
      throw new Error('Unsafe storage path');
    }
    return full;
  }

  private resolveReadPath(key: string): string | null {
    const safeKey = sanitizeStorageKey(key);
    const primary = path.resolve(this.rootDir, safeKey);
    if (
      primary.startsWith(this.rootDir + path.sep) &&
      fs.existsSync(primary) &&
      fs.statSync(primary).isFile()
    ) {
      return primary;
    }

    if (this.fallbackDir) {
      const secondary = path.resolve(this.fallbackDir, safeKey);
      if (
        secondary.startsWith(this.fallbackDir + path.sep) &&
        fs.existsSync(secondary) &&
        fs.statSync(secondary).isFile()
      ) {
        return secondary;
      }
    }
    return null;
  }

  async putObject(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<void> {
    const targetPath = this.resolveWritePath(input.key);
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, input.body);
  }

  async headObject(key: string): Promise<StorageObjectHead | null> {
    const filePath = this.resolveReadPath(key);
    if (!filePath) return null;
    const stat = await fs.promises.stat(filePath);
    return {
      size: stat.size,
      contentType: inferMimeType(key),
    };
  }

  async getObjectStream(key: string, rangeHeader?: string): Promise<StorageStreamResult | null> {
    const filePath = this.resolveReadPath(key);
    if (!filePath) return null;

    const stat = await fs.promises.stat(filePath);
    const totalLength = stat.size;
    const contentType = inferMimeType(key);

    const range = parseByteRange(rangeHeader, totalLength);
    if (range === 'unsatisfiable') {
      return {
        status: 416,
        contentType,
        contentLength: 0,
        totalLength,
        contentRange: `bytes */${totalLength}`,
      };
    }

    if (range) {
      return {
        status: 206,
        stream: fs.createReadStream(filePath, { start: range.start, end: range.end }),
        contentType,
        contentLength: range.end - range.start + 1,
        totalLength,
        contentRange: `bytes ${range.start}-${range.end}/${totalLength}`,
      };
    }

    return {
      status: 200,
      stream: fs.createReadStream(filePath),
      contentType,
      contentLength: totalLength,
      totalLength,
    };
  }

  async createUploadPresignedUrl(input: {
    key: string;
    contentType: string;
  }): Promise<{ driver: 'local' | 'r2'; key: string; uploadUrl: string }> {
    const safeKey = sanitizeStorageKey(input.key);
    return {
      driver: 'local',
      key: safeKey,
      uploadUrl: `/api/v1/media/upload/${safeKey}`,
    };
  }
}

class R2S3StorageService implements StorageService {
  public readonly driver = 'r2' as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;

  constructor(env: AppEnv) {
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('R2 storage driver requires S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY');
    }
    this.bucket = env.S3_BUCKET;
    this.publicBaseUrl = env.R2_PUBLIC_BASE_URL || undefined;
    this.client = new S3Client({
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async putObject(input: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<void> {
    const safeKey = sanitizeStorageKey(input.key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        Body: input.body,
        ContentType: input.contentType,
      })
    );
  }

  async headObject(key: string): Promise<StorageObjectHead | null> {
    const safeKey = sanitizeStorageKey(key);
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: safeKey })
      );
      return {
        size: Number(head.ContentLength ?? 0),
        contentType: head.ContentType || inferMimeType(safeKey),
        eTag: head.ETag,
      };
    } catch {
      return null;
    }
  }

  async getObjectStream(key: string, rangeHeader?: string): Promise<StorageStreamResult | null> {
    const safeKey = sanitizeStorageKey(key);
    const head = await this.headObject(safeKey);
    if (!head) return null;

    const range = parseByteRange(rangeHeader, head.size);
    if (range === 'unsatisfiable') {
      return {
        status: 416,
        contentType: head.contentType,
        contentLength: 0,
        totalLength: head.size,
        contentRange: `bytes */${head.size}`,
      };
    }

    const r2Range = range ? `bytes=${range.start}-${range.end}` : undefined;
    const obj = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        Range: r2Range,
      })
    );

    if (!obj.Body) return null;
    const stream = obj.Body as unknown as Readable;

    if (range) {
      return {
        status: 206,
        stream,
        contentType: obj.ContentType || head.contentType,
        contentLength: Number(obj.ContentLength ?? range.end - range.start + 1),
        totalLength: head.size,
        contentRange: obj.ContentRange || `bytes ${range.start}-${range.end}/${head.size}`,
      };
    }

    return {
      status: 200,
      stream,
      contentType: obj.ContentType || head.contentType,
      contentLength: Number(obj.ContentLength ?? head.size),
      totalLength: head.size,
    };
  }

  async createUploadPresignedUrl(input: {
    key: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<{ driver: 'local' | 'r2'; key: string; uploadUrl: string; publicUrl?: string }> {
    const safeKey = sanitizeStorageKey(input.key);
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: safeKey,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresInSeconds ?? 900,
    });
    return {
      driver: 'r2',
      key: safeKey,
      uploadUrl,
      publicUrl: this.publicBaseUrl ? `${this.publicBaseUrl.replace(/\/$/, '')}/${safeKey}` : undefined,
    };
  }
}

export function createStorageService(env: AppEnv): StorageService {
  if (env.STORAGE_DRIVER === 'r2') {
    return new R2S3StorageService(env);
  }
  const defaultPublicDir = path.resolve(process.cwd(), '../../public');
  const fallbackDir =
    env.PUBLIC_ASSETS_FALLBACK_DIR ||
    (fs.existsSync(defaultPublicDir) ? defaultPublicDir : undefined);
  return new LocalStorageService(env.STORAGE_LOCAL_DIR, fallbackDir);
}
