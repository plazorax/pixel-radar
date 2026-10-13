import { describe, expect, it } from 'vitest';
import { createAuth, parseCookies, SESSION_COOKIE } from '../src/auth.js';

describe('createAuth', () => {
  it('is disabled without a password and then authorizes everyone', () => {
    const auth = createAuth({});
    expect(auth.enabled).toBe(false);
    expect(auth.isAuthorized({})).toBe(true);
    expect(auth.checkPassword('')).toBe(false);
  });

  it('checks the password', () => {
    const auth = createAuth({ password: 'correct horse' });
    expect(auth.checkPassword('correct horse')).toBe(true);
    expect(auth.checkPassword('wrong')).toBe(false);
    expect(auth.isAuthorized({})).toBe(false);
  });

  it('issues tokens that verify until they expire', () => {
    const auth = createAuth({ password: 'pw', secret: 's', maxAgeMs: 1000 });
    const issued = new Date('2026-10-13T00:00:00Z');
    const token = auth.issueToken(issued);
    expect(auth.verifyToken(token, new Date(issued.getTime() + 500))).toBe(true);
    expect(auth.verifyToken(token, new Date(issued.getTime() + 1500))).toBe(false);
    expect(auth.isAuthorized({ cookie: `a=b; ${SESSION_COOKIE}=${token}` }, issued)).toBe(true);
  });

  it('rejects tampered tokens and tokens from another secret or password', () => {
    const auth = createAuth({ password: 'pw', secret: 's' });
    const token = auth.issueToken();
    const [issued, signature] = token.split('.');
    expect(auth.verifyToken(`${Number(issued) + 1}.${signature}`)).toBe(false);
    expect(auth.verifyToken('garbage')).toBe(false);
    expect(createAuth({ password: 'pw', secret: 'other' }).verifyToken(token)).toBe(false);
    expect(createAuth({ password: 'new', secret: 's' }).verifyToken(token)).toBe(false);
  });

  it('accepts the password as a bearer token for scripts', () => {
    const auth = createAuth({ password: 'pw' });
    expect(auth.isAuthorized({ authorization: 'Bearer pw' })).toBe(true);
    expect(auth.isAuthorized({ authorization: 'Bearer nope' })).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses a cookie header', () => {
    expect(parseCookies('a=1; b=hello%20world;c')).toEqual({ a: '1', b: 'hello world' });
    expect(parseCookies(undefined)).toEqual({});
  });
});
