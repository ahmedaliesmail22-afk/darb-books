import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AppEnv } from '../env';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expectedHex = parts[5];
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !expectedHex) {
    return false;
  }

  const expected = Buffer.from(expectedHex, 'hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: n, r, p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });

  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function sha256Hex(raw: string): string {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  typ: 'access';
}

export async function signAccessToken(
  payload: { userId: string; email: string },
  env: Pick<AppEnv, 'JWT_ACCESS_SECRET' | 'JWT_ACCESS_TTL_SEC'>
): Promise<string> {
  const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  return await new SignJWT({ email: payload.email, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SEC}s`)
    .sign(key);
}

export async function verifyAccessToken(
  token: string,
  env: Pick<AppEnv, 'JWT_ACCESS_SECRET'>
): Promise<AccessTokenClaims | null> {
  try {
    const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      payload.typ !== 'access'
    ) {
      return null;
    }
    return { sub: payload.sub, email: payload.email, typ: 'access' };
  } catch {
    return null;
  }
}
