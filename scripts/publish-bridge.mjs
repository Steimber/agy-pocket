import { execFileSync } from 'child_process';
import { encryptBridgeUrl } from '../lib/bridge-crypto.js';

const tunnelUrl = process.argv[2] || '';
if (!tunnelUrl) {
  console.error('Uso: node scripts/publish-bridge.mjs <https://tunnel-url>');
  process.exit(1);
}

try {
  const envelope = encryptBridgeUrl(tunnelUrl);
  const gistId = (process.env.AGY_BRIDGE_GIST_ID || '').trim();
  if (!/^[0-9a-f]{20,40}$/i.test(gistId)) {
    throw new Error('Configurá AGY_BRIDGE_GIST_ID en tu .env.local.');
  }
  const body = JSON.stringify({
    files: {
      'agy-pocket-bridge.json': {
        content: JSON.stringify(envelope)
      }
    }
  });

  execFileSync('gh', ['api', `/gists/${gistId}`, '-X', 'PATCH', '--input', '-'], {
    input: body,
    stdio: ['pipe', 'ignore', 'pipe']
  });
  console.log(`[OK] Puente cifrado sincronizado con Vercel (${tunnelUrl})`);
} catch (err) {
  console.error('[WARN] No se pudo publicar el puente cifrado:', err.message);
  process.exit(1);
}
