import fs from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { isRequestAuthenticated } from '../../../lib/auth';
import { resolveSafeLocalFilePath } from '../../../lib/agy-bridge';
import {
  shouldProxyToRemoteBridge,
  buildRemoteBridgeFileUrl
} from '../../../lib/bridge-crypto';

function buildContentDisposition(fileName, download) {
  const dispType = download ? 'attachment' : 'inline';
  const asciiFallback = String(fileName || 'archivo')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName || 'archivo');
  return `${dispType}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get('path') || '';
  const download = searchParams.get('download') !== '0';

  if (!rawPath) {
    return NextResponse.json(
      { ok: false, error: 'Falta el parámetro path.' },
      { status: 400 }
    );
  }

  if (!searchParams.has('bauth') && shouldProxyToRemoteBridge(request)) {
    const redirectUrl = await buildRemoteBridgeFileUrl(rawPath, download);
    if (!redirectUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Tu PC aún no tiene el túnel activo para descargar el archivo.'
        },
        { status: 503 }
      );
    }
    return NextResponse.redirect(redirectUrl, 307);
  }

  const resolved = resolveSafeLocalFilePath(rawPath);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 }
    );
  }

  const { filePath, fileName, size, mimeType } = resolved;
  const effectiveDownload = download || mimeType.startsWith('text/html');
  const rangeHeader = request.headers.get('range');

  const commonHeaders = {
    'Content-Type': mimeType,
    'Content-Disposition': buildContentDisposition(fileName, effectiveDownload),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"
  };

  if (rangeHeader && size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (!match[1] && match[2]) {
        const suffixLen = parseInt(match[2], 10);
        start = Math.max(0, size - suffixLen);
        end = size - 1;
      }
      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start < 0 ||
        end >= size ||
        start > end
      ) {
        return new Response(null, {
          status: 416,
          headers: {
            ...commonHeaders,
            'Content-Range': `bytes */${size}`
          }
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath, {
        start,
        end
      });
      request.signal?.addEventListener('abort', () => nodeStream.destroy(), {
        once: true
      });
      return new Response(Readable.toWeb(nodeStream), {
        status: 206,
        headers: {
          ...commonHeaders,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(chunkSize)
        }
      });
    }
  }

  const nodeStream = fs.createReadStream(/*turbopackIgnore: true*/ filePath);
  request.signal?.addEventListener('abort', () => nodeStream.destroy(), {
    once: true
  });
  return new Response(Readable.toWeb(nodeStream), {
    status: 200,
    headers: {
      ...commonHeaders,
      'Content-Length': String(size)
    }
  });
}
