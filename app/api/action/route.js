import { NextResponse } from 'next/server';
import { isRequestAuthenticated } from '../../../lib/auth';
import { performAntigravityAction } from '../../../lib/agy-bridge';
import {
  shouldProxyToRemoteBridge,
  proxyToRemoteBridge
} from '../../../lib/bridge-crypto';

export async function POST(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (shouldProxyToRemoteBridge(request)) {
      const proxied = await proxyToRemoteBridge(request, '/api/action', 'POST', body);
      return NextResponse.json(proxied.data, { status: proxied.ok ? 200 : proxied.status });
    }

    const res = await performAntigravityAction(body.action, body);
    if (!res.ok) {
      return NextResponse.json(res, { status: 400 });
    }
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
