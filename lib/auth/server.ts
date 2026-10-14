import { createRemoteJWKSet, jwtVerify } from 'jose';

export type AuthRole = 'student' | 'teacher' | 'admin';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  source: 'google';
  createdAt: string;
  lastLoginAt: string;
};

export const SESSION_COOKIE = 'dopsat_session';
export const FLOW_COOKIE = 'dopsat_oauth_flow';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function getGoogleAuthConfig() {
  const values = {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    schoolDomain: process.env.GOOGLE_SCHOOL_DOMAIN?.trim().toLowerCase() ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() ?? '',
    sessionSecret: process.env.AUTH_SESSION_SECRET?.trim() ?? '',
    teacherEmails: splitEmails(process.env.GOOGLE_TEACHER_EMAILS),
    adminEmails: splitEmails(process.env.GOOGLE_ADMIN_EMAILS),
  };
  const missing: string[] = [];
  if (!values.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!values.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!values.schoolDomain) missing.push('GOOGLE_SCHOOL_DOMAIN');
  if (!values.redirectUri) missing.push('GOOGLE_REDIRECT_URI');
  if (values.sessionSecret.length < 32) missing.push('AUTH_SESSION_SECRET');
  return { ...values, configured: missing.length === 0, missing };
}

function splitEmails(value?: string) {
  return new Set((value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function roleForEmail(email: string, config: ReturnType<typeof getGoogleAuthConfig>): AuthRole {
  const normalized = email.toLowerCase();
  if (config.adminEmails.has(normalized)) return 'admin';
  if (config.teacherEmails.has(normalized)) return 'teacher';
  return 'student';
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signValue(payload: unknown, secret: string) {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(encoded));
  return `${encoded}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyValue<T>(value: string | undefined, secret: string): Promise<T | null> {
  if (!value || !secret) return null;
  const [encoded, signature, extra] = value.split('.');
  if (!encoded || !signature || extra) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), new TextEncoder().encode(encoded));
  if (!valid) return null;
  try { return JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as T; } catch { return null; }
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function buildGoogleAuthorizationUrl(config: ReturnType<typeof getGoogleAuthConfig>, state: string, nonce: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    hd: config.schoolDomain,
    prompt: 'select_account',
  }).toString();
  return url;
}

export async function exchangeCode(code: string, config: ReturnType<typeof getGoogleAuthConfig>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new Error('Google token exchange failed');
  const payload = await response.json() as { id_token?: string };
  if (!payload.id_token) throw new Error('Google did not return an ID token');
  return payload.id_token;
}

export async function verifyGoogleIdentity(idToken: string, nonce: string, config: ReturnType<typeof getGoogleAuthConfig>) {
  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: config.clientId,
  });
  if (payload.nonce !== nonce) throw new Error('Invalid nonce');
  if (payload.email_verified !== true) throw new Error('Email is not verified');
  if (typeof payload.email !== 'string' || typeof payload.sub !== 'string') throw new Error('Identity claims are incomplete');
  if (payload.hd !== config.schoolDomain) throw new Error('Account is outside the school domain');
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : payload.email,
  };
}

export async function provisionGoogleUser(identity: { sub: string; email: string; name: string }, config: ReturnType<typeof getGoogleAuthConfig>): Promise<SessionUser> {
  const now = new Date().toISOString();
  // Production persistence boundary: replace this return value with a transactional
  // upsert keyed by Google `sub`, then return the persisted role and timestamps.
  return {
    id: `google:${identity.sub}`,
    email: identity.email,
    name: identity.name,
    role: roleForEmail(identity.email, config),
    source: 'google',
    createdAt: now,
    lastLoginAt: now,
  };
}

export async function createSessionValue(user: SessionUser, secret: string) {
  return signValue({ user, exp: Date.now() + 8 * 60 * 60 * 1000 }, secret);
}

export async function readSessionValue(value: string | undefined, secret: string) {
  const session = await verifyValue<{ user: SessionUser; exp: number }>(value, secret);
  if (!session || session.exp < Date.now()) return null;
  return session.user;
}
