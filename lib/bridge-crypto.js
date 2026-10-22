import crypto from 'crypto';
import fs from 'fs';
import {
  getSecretKey,
  getConfiguredPin,
  createBridgeInternalHeader
} from './auth.js';
import { getBrainDir, getDevToolsActivePortFile } from './agy-bridge.js';

let cachedBridgeUrl = null;
let cachedBridgeAtMs = 0;
const BRIDGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes while healthy

function deriveAesKey(secret = getSecretKey(), pin = getConfiguredPin()) {
  if (!secret || secret.length < 16 || !pin || pin.length < 4) {
    throw new Error('AGY_POCKET_SECRET y AGY_POCKET_PIN deben estar configurados.');
  }
  return crypto
    .createHash('sha256')
    .update(`v1::${secret}::${pin}::agy-pocket-bridge`)
    .digest();
}

export function isPrivateOrLoopbackHost(hostname) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd00:')
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return true;
  }
  const m172 = host.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function normalizeBridgeBaseUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function encryptBridgeUrl(
  tunnelUrl,
  secret = getSecretKey(),
  pin = getConfiguredPin()
) {
  const cleanUrl = normalizeBridgeBaseUrl(tunnelUrl);
  if (!cleanUrl) {
    throw new Error('URL de puente inválida.');
  }
  const key = deriveAesKey(secret, pin);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify({ url: cleanUrl, ts: Date.now() });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('base64'),
    updatedAt: new Date().toISOString()
  };
}

export function decryptBridgeUrl(
  envelope,
  secret = getSecretKey(),
  pin = getConfiguredPin()
) {
  try {
    if (!envelope || typeof envelope !== 'object' || envelope.v !== 1) return null;
    const { iv, tag, data } = envelope;
    if (
      typeof iv !== 'string' ||
      !/^[0-9a-f]{24}$/i.test(iv) ||
      typeof tag !== 'string' ||
      !/^[0-9a-f]{32}$/i.test(tag) ||
      typeof data !== 'string' ||
      !data
    ) {
      return null;
    }
    const key = deriveAesKey(secret, pin);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data, 'base64')),
      decipher.final()
    ]).toString('utf8');
    const parsed = JSON.parse(decrypted);
    return normalizeBridgeBaseUrl(parsed?.url);
  } catch {
    return null;
  }
}

export function hasLocalAntigravityEnvironment() {
  try {
    return (
      fs.existsSync(/*turbopackIgnore: true*/ getDevToolsActivePortFile()) ||
      fs.existsSync(/*turbopackIgnore: true*/ getBrainDir())
    );
  } catch {
    return false;
  }
}

export function shouldProxyToRemoteBridge(request) {
  if (request.headers.get('x-agy-proxied') === '1') {
    return false;
  }
  if (normalizeBridgeBaseUrl(process.env.AGY_BRIDGE_URL)) {
    return true;
  }
  return !hasLocalAntigravityEnvironment();
}

export async function resolveRemoteBridgeUrl(forceRefresh = false) {
  const explicitEnvUrl = normalizeBridgeBaseUrl(process.env.AGY_BRIDGE_URL);
  if (explicitEnvUrl) {
    return explicitEnvUrl;
  }

  const now = Date.now();
  if (!forceRefresh && cachedBridgeUrl && now - cachedBridgeAtMs < BRIDGE_CACHE_TTL_MS) {
    return cachedBridgeUrl;
  }

  const gistId = (process.env.AGY_BRIDGE_GIST_ID || '').trim();
  if (!/^[0-9a-f]{20,40}$/i.test(gistId)) {
    return null;
  }

  // 1. Try GitHub API first (always fresh)
  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'agy-pocket-bridge'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const gist = await res.json();
      const rawContent = gist?.files?.['agy-pocket-bridge.json']?.content;
      if (rawContent) {
        const envelope = JSON.parse(rawContent);
        const url = decryptBridgeUrl(envelope);
        if (url) {
          cachedBridgeUrl = url;
          cachedBridgeAtMs = Date.now();
          return url;
        }
      }
    }
  } catch {}

  // 2. Fallback to raw gist CDN with cache-buster
  try {
    const rawRes = await fetch(
      `https://gist.githubusercontent.com/Steimber/${gistId}/raw/agy-pocket-bridge.json?t=${Date.now()}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(3500)
      }
    );
    if (rawRes.ok) {
      const envelope = await rawRes.json();
      const url = decryptBridgeUrl(envelope);
      if (url) {
        cachedBridgeUrl = url;
        cachedBridgeAtMs = Date.now();
        return url;
      }
    }
  } catch {}

  return cachedBridgeUrl;
}

async function safeParseJsonResponse(res) {
  const text = await res.text();
  try {
    return { validJson: true, data: JSON.parse(text) };
  } catch {
    return { validJson: false, data: null };
  }
}

export async function proxyToRemoteBridge(request, pathAndQuery, method = 'GET', bodyObj = null) {
  let baseUrl = await resolveRemoteBridgeUrl(false);
  if (!baseUrl) {
    return {
      ok: false,
      status: 503,
      data: {
        ok: false,
        connected: false,
        error:
          'Tu PC aún no tiene el túnel activo. Ejecutá start-pocket.ps1 ("activa app") en tu PC.'
      }
    };
  }

  const attemptFetch = async targetBase => {
    const headers = {
      'x-agy-proxied': '1',
      'x-agy-bridge-auth': createBridgeInternalHeader()
    };
    const fetchOpts = {
      method,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    };
    if (method !== 'GET' && bodyObj !== null) {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(bodyObj);
    }
    return fetch(`${targetBase}${pathAndQuery}`, fetchOpts);
  };

  let didRefresh = false;

  try {
    let res = await attemptFetch(baseUrl);
    if ([502, 503, 504, 530].includes(res.status)) {
      didRefresh = true;
      const refreshedUrl = await resolveRemoteBridgeUrl(true);
      if (refreshedUrl && refreshedUrl !== baseUrl) {
        baseUrl = refreshedUrl;
        res = await attemptFetch(baseUrl);
      }
    }

    const parsed = await safeParseJsonResponse(res);
    if (parsed.validJson && parsed.data && typeof parsed.data === 'object') {
      return { ok: res.ok, status: res.status, data: parsed.data };
    }

    return {
      ok: false,
      status: 502,
      data: {
        ok: false,
        connected: false,
        error: 'El túnel de tu PC está desconectado o reiniciando.'
      }
    };
  } catch {
    if (!didRefresh) {
      try {
        const refreshedUrl = await resolveRemoteBridgeUrl(true);
        if (refreshedUrl && refreshedUrl !== baseUrl) {
          const res = await attemptFetch(refreshedUrl);
          const parsed = await safeParseJsonResponse(res);
          if (parsed.validJson && parsed.data && typeof parsed.data === 'object') {
            return { ok: res.ok, status: res.status, data: parsed.data };
          }
        }
      } catch {}
    }

    return {
      ok: false,
      status: 502,
      data: {
        ok: false,
        connected: false,
        error: 'No se pudo conectar al túnel de tu PC. Verificá que siga encendida.'
      }
    };
  }
}

export async function buildRemoteBridgeFileUrl(rawPath, download = true) {
  const baseUrl = await resolveRemoteBridgeUrl(false);
  if (!baseUrl) return null;
  const bauth = createBridgeInternalHeader();
  const dlParam = download ? '1' : '0';
  return `${baseUrl}/api/file?path=${encodeURIComponent(rawPath)}&download=${dlParam}&bauth=${encodeURIComponent(bauth)}`;
}
