import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'agy_pocket_session';
// 400 days is the maximum Cookie Max-Age allowed by modern browsers (RFC 6265bis);
// token verification itself is permanent (never expires unless secret/PIN changes or user logs out).
export const SESSION_TTL_SEC = 400 * 24 * 60 * 60;

export function getSecretKey() {
  return process.env.AGY_POCKET_SECRET?.trim() || '';
}

export function getConfiguredPin() {
  return process.env.AGY_POCKET_PIN?.trim() || '';
}

export function createSessionToken(nowMs = Date.now(), secret = getSecretKey()) {
  if (!secret || secret.length < 16) {
    throw new Error('AGY_POCKET_SECRET debe tener al menos 16 caracteres.');
  }
  const issuedMs = Number.isFinite(nowMs) ? Math.floor(nowMs) : Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `v1.${issuedMs}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token, _nowMs = Date.now(), secret = getSecretKey()) {
  if (!secret || secret.length < 16) return false;
  if (!token || typeof token !== 'string') return false;
  const parts = token.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const issuedMs = Number(parts[1]);
  const nonce = parts[2];
  const providedSig = parts[3];
  if (
    !Number.isFinite(issuedMs) ||
    issuedMs <= 0 ||
    !nonce ||
    !/^[0-9a-f]{64}$/i.test(providedSig)
  ) {
    return false;
  }
  const payload = `v1.${issuedMs}.${nonce}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  try {
    const a = Buffer.from(providedSig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function createBridgeInternalHeader(nowMs = Date.now(), secret = getSecretKey()) {
  if (!secret || secret.length < 16) return '';
  const nonce = crypto.randomBytes(10).toString('hex');
  const payload = `b1.${nowMs}.${nonce}`;
  const sig = crypto
    .createHmac('sha256', `${secret}::bridge-internal`)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

export function verifyBridgeInternalHeader(
  headerVal,
  nowMs = Date.now(),
  secret = getSecretKey()
) {
  if (!secret || secret.length < 16) return false;
  if (!headerVal || typeof headerVal !== 'string') return false;
  const parts = headerVal.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'b1') return false;
  const ts = Number(parts[1]);
  const nonce = parts[2];
  const providedSig = parts[3];
  if (
    !Number.isFinite(ts) ||
    Math.abs(nowMs - ts) > 300_000 ||
    !nonce ||
    !/^[0-9a-f]{64}$/i.test(providedSig)
  ) {
    return false;
  }
  const payload = `b1.${ts}.${nonce}`;
  const expectedSig = crypto
    .createHmac('sha256', `${secret}::bridge-internal`)
    .update(payload)
    .digest('hex');
  try {
    const a = Buffer.from(providedSig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyPinInput(inputPin, expectedPin = getConfiguredPin()) {
  const cleanInput = String(inputPin ?? '').trim();
  const cleanExpected = String(expectedPin ?? '').trim();
  if (!cleanInput || !cleanExpected || cleanExpected.length < 4) return false;
  const a = Buffer.from(cleanInput, 'utf8');
  const b = Buffer.from(cleanExpected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function isRequestAuthenticated(request) {
  const bridgeAuth = request.headers.get('x-agy-bridge-auth') || '';
  if (bridgeAuth && verifyBridgeInternalHeader(bridgeAuth)) {
    return true;
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (verifySessionToken(bearerToken)) return true;
  }
  const cookies = parseCookieHeader(request.headers.get('cookie') || '');
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  return verifySessionToken(cookieToken);
}
