import { NextResponse } from 'next/server';
import { isRequestAuthenticated } from '../../../lib/auth';
import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  sendPushNotificationToAll
} from '../../../lib/push-manager';
import {
  shouldProxyToRemoteBridge,
  proxyToRemoteBridge
} from '../../../lib/bridge-crypto';

export async function GET(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (shouldProxyToRemoteBridge(request)) {
    const proxied = await proxyToRemoteBridge(request, '/api/push', 'GET');
    if (proxied.ok) {
      return NextResponse.json(proxied.data);
    }
    return NextResponse.json(
      { ok: false, error: proxied.data?.error || 'Sin conexión con tu PC' },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    ...getVapidPublicKey()
  });
}

export async function POST(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (shouldProxyToRemoteBridge(request)) {
      const proxied = await proxyToRemoteBridge(request, '/api/push', 'POST', body);
      return NextResponse.json(proxied.data, {
        status: proxied.ok ? 200 : proxied.status
      });
    }

    const action = body.action || 'subscribe';

    if (action === 'subscribe') {
      const res = registerPushSubscription(body.subscription);
      if (!res.ok) {
        return NextResponse.json(res, { status: 400 });
      }
      if (body.sendWelcome !== false) {
        await sendPushNotificationToAll({
          title: 'Antigravity • Notificaciones activas',
          body: 'Te avisaremos apenas termine una tarea en cualquier sesión.',
          tag: 'agy-welcome'
        });
      }
      return NextResponse.json(res);
    }

    if (action === 'unsubscribe') {
      const res = unregisterPushSubscription(body.endpoint);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    if (action === 'test') {
      const sent = await sendPushNotificationToAll({
        title: 'Antigravity • Notificación de prueba',
        body: 'Las alertas en segundo plano están conectadas con tu PC.',
        conversationId: body.conversationId || null,
        tag: 'agy-test'
      });
      return NextResponse.json({ ok: true, ...sent });
    }

    return NextResponse.json({ ok: false, error: 'Acción inválida.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Error configurando Push.' },
      { status: 500 }
    );
  }
}
