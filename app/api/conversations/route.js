import { NextResponse } from 'next/server';
import { isRequestAuthenticated } from '../../../lib/auth';
import { getAntigravityLiveState } from '../../../lib/agy-bridge';
import {
  shouldProxyToRemoteBridge,
  proxyToRemoteBridge
} from '../../../lib/bridge-crypto';

export async function GET(request) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (shouldProxyToRemoteBridge(request)) {
    const proxied = await proxyToRemoteBridge(request, '/api/conversations', 'GET');
    if (proxied.ok) {
      return NextResponse.json(proxied.data);
    }
    return NextResponse.json({
      connected: false,
      activeConversationId: null,
      windowTitle: 'Antigravity',
      model: 'Gemini',
      preset: 'Turbo',
      isBusy: false,
      projects: [],
      conversations: [],
      bridgeError: proxied.data?.error || null
    });
  }

  const state = await getAntigravityLiveState();
  return NextResponse.json(state);
}
