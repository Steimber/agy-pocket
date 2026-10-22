import { NextResponse } from 'next/server';
import { isRequestAuthenticated } from '../../../lib/auth';
import {
  getAntigravityQuickStatus,
  isValidConversationId,
  readConversationTranscript,
  sendPromptToAntigravity
} from '../../../lib/agy-bridge';
import {
  shouldProxyToRemoteBridge,
  proxyToRemoteBridge
} from '../../../lib/bridge-crypto';

export async function GET(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let conversationId = searchParams.get('conversationId') || '';
  const limit = Math.min(120, Math.max(10, Number(searchParams.get('limit')) || 60));

  if (shouldProxyToRemoteBridge(request)) {
    const qs = conversationId
      ? `?conversationId=${encodeURIComponent(conversationId)}&limit=${limit}`
      : `?limit=${limit}`;
    const proxied = await proxyToRemoteBridge(request, `/api/messages${qs}`, 'GET');
    if (proxied.ok) {
      return NextResponse.json(proxied.data);
    }
    return NextResponse.json({
      conversationId,
      connected: false,
      activeConversationId: null,
      model: 'Gemini',
      preset: 'Turbo',
      isBusy: false,
      messages: [],
      lastStepIndex: -1,
      updatedAt: null,
      bridgeError: proxied.data?.error || 'Sin conexión con el túnel de tu PC'
    });
  }

  const live = await getAntigravityQuickStatus();

  if (conversationId === '__new__') {
    if (isValidConversationId(live.activeConversationId)) {
      conversationId = live.activeConversationId;
    }
  } else if (!isValidConversationId(conversationId)) {
    conversationId = live.activeConversationId || '';
  }

  const transcript = isValidConversationId(conversationId)
    ? readConversationTranscript(conversationId, limit)
    : { messages: [], lastStepIndex: -1, updatedAt: null };

  return NextResponse.json({
    conversationId,
    connected: live.connected,
    activeConversationId: live.activeConversationId,
    model: live.model,
    preset: live.preset,
    isBusy: live.isBusy,
    ...transcript
  });
}

export async function POST(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const text = String(body.text || '').trim();
    const conversationId = body.conversationId || null;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!text && attachments.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Escribí un mensaje o adjuntá un archivo.' },
        { status: 400 }
      );
    }

    if (shouldProxyToRemoteBridge(request)) {
      const proxied = await proxyToRemoteBridge(request, '/api/messages', 'POST', {
        text,
        conversationId,
        attachments
      });
      return NextResponse.json(proxied.data, { status: proxied.ok ? 200 : proxied.status });
    }

    const res = await sendPromptToAntigravity(text, conversationId, attachments);
    if (!res.ok) {
      return NextResponse.json(res, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      conversationId: res.conversationId || null
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
