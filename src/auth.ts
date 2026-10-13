import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'pr_session';
export const DEFAULT_SESSION_MAX_AGE_MS = 7 * 24 * 3_600_000;

export interface AuthOptions {
  /** Dashboard password (PIXEL_RADAR_PASSWORD). Empty or undefined disables authentication. */
  password?: string;
  /** HMAC key for session tokens (PIXEL_RADAR_SESSION_SECRET). Random per process when omitted. */
  secret?: string;
  maxAgeMs?: number;
}

export interface Auth {
  enabled: boolean;
  maxAgeMs: number;
  checkPassword(candidate: string): boolean;
  issueToken(now?: Date): string;
  verifyToken(token: string | undefined, now?: Date): boolean;
  /** Accepts a valid session cookie or `Authorization: Bearer <password>`. */
  isAuthorized(headers: { cookie?: string; authorization?: string }, now?: Date): boolean;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export function createAuth(options: AuthOptions = {}): Auth {
  const password = options.password ?? '';
  const enabled = password.length > 0;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_SESSION_MAX_AGE_MS;
  // Mixing the password into the key means changing the password logs every session out.
  const key = createHmac('sha256', options.secret || randomBytes(32).toString('hex'))
    .update(password)
    .digest();

  const sign = (payload: string) => createHmac('sha256', key).update(payload).digest('base64url');

  const checkPassword = (candidate: string) => enabled && timingSafeEqual(sha256(candidate), sha256(password));

  const verifyToken = (token: string | undefined, now = new Date()) => {
    if (!enabled || !token) return false;
    const [issued, signature] = token.split('.');
    if (!issued || !signature || !/^\d+$/.test(issued)) return false;
    const expected = Buffer.from(sign(issued));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const age = now.getTime() - Number(issued);
    return age >= 0 && age <= maxAgeMs;
  };

  return {
    enabled,
    maxAgeMs,
    checkPassword,
    issueToken: (now = new Date()) => {
      const issued = String(now.getTime());
      return `${issued}.${sign(issued)}`;
    },
    verifyToken,
    isAuthorized: (headers, now) => {
      if (!enabled) return true;
      const bearer = headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (bearer !== undefined && checkPassword(bearer)) return true;
      return verifyToken(parseCookies(headers.cookie)[SESSION_COOKIE], now);
    },
  };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies;
}
