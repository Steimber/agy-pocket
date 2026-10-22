import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import {
  getAntigravityLiveState,
  readConversationTranscript
} from './agy-bridge.js';
import { isPrivateOrLoopbackHost } from './bridge-crypto.js';

function getPushStateFilePath() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), '.agy-push-state.json');
}

function getWatcherGlobal() {
  if (!globalThis.__agyPushWatcherState) {
    globalThis.__agyPushWatcherState = {
      initialized: false,
      timer: null,
      polling: false,
      inspecting: false,
      runningIds: new Set(),
      runningMeta: new Map(),
      recentCompletions: []
    };
  }
  return globalThis.__agyPushWatcherState;
}

function loadPushState() {
  const filePath = getPushStateFilePath();
  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      const raw = fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.vapidKeys?.publicKey &&
        parsed.vapidKeys?.privateKey &&
        Array.isArray(parsed.subscriptions)
      ) {
        return {
          vapidKeys: parsed.vapidKeys,
          subscriptions: parsed.subscriptions,
          lastNotifiedStepByConv: parsed.lastNotifiedStepByConv || {}
        };
      }
    }
  } catch {}

  const vapidKeys = webpush.generateVAPIDKeys();
  const initialState = {
    vapidKeys,
    subscriptions: [],
    lastNotifiedStepByConv: {}
  };
  savePushState(initialState);
  return initialState;
}

function savePushState(state) {
  const filePath = getPushStateFilePath();
  try {
    fs.writeFileSync(
      /*turbopackIgnore: true*/ filePath,
      JSON.stringify(state, null, 2),
      'utf8'
    );
  } catch {}
}

export function getVapidPublicKey() {
  const state = loadPushState();
  ensureBackgroundPushWatcher();
  return {
    publicKey: state.vapidKeys.publicKey,
    subscriptionCount: state.subscriptions.length
  };
}

export function isValidPushSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  if (typeof sub.endpoint !== 'string') return false;
  try {
    const parsed = new URL(sub.endpoint.trim());
    if (parsed.protocol !== 'https:') return false;
    if (isPrivateOrLoopbackHost(parsed.hostname)) return false;
  } catch {
    return false;
  }
  if (
    !sub.keys ||
    typeof sub.keys.p256dh !== 'string' ||
    typeof sub.keys.auth !== 'string' ||
    !sub.keys.p256dh.trim() ||
    !sub.keys.auth.trim()
  ) {
    return false;
  }
  return true;
}

export function registerPushSubscription(sub) {
  if (!isValidPushSubscription(sub)) {
    return { ok: false, error: 'Suscripción Push inválida.' };
  }
  const state = loadPushState();
  const cleanSub = {
    endpoint: sub.endpoint.trim(),
    expirationTime: sub.expirationTime || null,
    keys: {
      p256dh: sub.keys.p256dh.trim(),
      auth: sub.keys.auth.trim()
    },
    updatedAt: new Date().toISOString()
  };

  const filtered = state.subscriptions.filter(s => s.endpoint !== cleanSub.endpoint);
  filtered.push(cleanSub);
  state.subscriptions = filtered.slice(-15);
  savePushState(state);
  ensureBackgroundPushWatcher();

  return {
    ok: true,
    subscriptionCount: state.subscriptions.length
  };
}

export function unregisterPushSubscription(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return { ok: false, error: 'Endpoint requerido.' };
  }
  const state = loadPushState();
  state.subscriptions = state.subscriptions.filter(s => s.endpoint !== endpoint.trim());
  savePushState(state);
  return {
    ok: true,
    subscriptionCount: state.subscriptions.length
  };
}

export function stripMarkdownForNotification(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '[Código]')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export const VAPID_SUBJECT = 'mailto:notifications@agypocket.app';

export async function sendPushNotificationToAll(payload) {
  const state = loadPushState();
  if (state.subscriptions.length === 0) {
    return { sent: 0, total: 0 };
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    state.vapidKeys.publicKey,
    state.vapidKeys.privateKey
  );

  const message = JSON.stringify({
    title: payload.title || 'Antigravity',
    body: payload.body || 'Tarea completada en tu PC.',
    conversationId: payload.conversationId || null,
    projectName: payload.projectName || 'Antigravity',
    tag: payload.tag || `agy-${Date.now()}`,
    ts: Date.now()
  });

  const deadEndpoints = new Set();
  let sentCount = 0;

  await Promise.all(
    state.subscriptions.map(async sub => {
      try {
        await webpush.sendNotification(sub, message, {
          TTL: 3600,
          urgency: 'high'
        });
        sentCount++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadEndpoints.add(sub.endpoint);
        }
      }
    })
  );

  if (deadEndpoints.size > 0) {
    const latest = loadPushState();
    latest.subscriptions = latest.subscriptions.filter(
      s => !deadEndpoints.has(s.endpoint)
    );
    savePushState(latest);
  }

  return { sent: sentCount, total: state.subscriptions.length };
}

export async function inspectLiveStateForCompletions(liveState) {
  if (!liveState || !liveState.connected) return [];
  const watcher = getWatcherGlobal();
  if (watcher.inspecting) return [];
  watcher.inspecting = true;

  try {
    const currentlyRunning = new Set();

    for (const conv of liveState.conversations || []) {
      if (!conv || !conv.id) continue;
      const isThisBusy =
        Boolean(conv.isRunning) ||
        (conv.id === liveState.activeConversationId && Boolean(liveState.isBusy));
      if (isThisBusy) {
        currentlyRunning.add(conv.id);
        watcher.runningMeta.set(conv.id, {
          title: conv.title || 'Sesión',
          projectName: conv.projectName || 'Antigravity'
        });
      }
    }

    if (liveState.isBusy && liveState.activeConversationId) {
      currentlyRunning.add(liveState.activeConversationId);
      if (!watcher.runningMeta.has(liveState.activeConversationId)) {
        watcher.runningMeta.set(liveState.activeConversationId, {
          title: liveState.windowTitle || 'Sesión activa',
          projectName: 'Antigravity'
        });
      }
    }

    const transitionedFromRunning = new Set();
    const candidateSet = new Set();
    for (const prevRunningId of watcher.runningIds) {
      if (!currentlyRunning.has(prevRunningId)) {
        transitionedFromRunning.add(prevRunningId);
        candidateSet.add(prevRunningId);
      }
    }

    // Also inspect top recent sessions in case a fast turn completed between polls
    for (const conv of (liveState.conversations || []).slice(0, 12)) {
      if (conv?.id && !currentlyRunning.has(conv.id)) {
        candidateSet.add(conv.id);
      }
    }

    const isFirstTick = !watcher.initialized;
    watcher.initialized = true;
    watcher.runningIds = currentlyRunning;

    if (candidateSet.size === 0) return [];

    const state = loadPushState();
    const updatedSteps = {};
    const triggered = [];

    for (const convId of candidateSet) {
      const transcript = readConversationTranscript(convId, 10);
      const stepIdx = transcript.lastStepIndex ?? -1;
      if (stepIdx < 0) continue;

      const lastNotified = state.lastNotifiedStepByConv[convId] ?? -999;
      const wasRunning = transitionedFromRunning.has(convId);

      // On first watcher boot, baseline existing step indices without spamming old turns
      if (isFirstTick && lastNotified === -999 && !wasRunning) {
        updatedSteps[convId] = stepIdx;
        continue;
      }

      if (stepIdx <= lastNotified) {
        continue;
      }

      const updatedMs = transcript.updatedAt ? Date.parse(transcript.updatedAt) : 0;
      const isRecent = updatedMs > 0 && Date.now() - updatedMs < 60000;
      const isCompletedTurn =
        transcript.lastStepType === 'PLANNER_RESPONSE' &&
        transcript.lastStepStatus === 'DONE' &&
        transcript.lastStepHasContent &&
        !transcript.lastStepHasToolCalls;

      // If this session had no prior baseline and wasn't explicitly seen running,
      // baseline it if it isn't a freshly completed turn, so future turns have a baseline.
      if (lastNotified === -999 && !wasRunning) {
        if (!isCompletedTurn || !isRecent) {
          updatedSteps[convId] = stepIdx;
          continue;
        }
      } else if (!wasRunning && !isCompletedTurn) {
        continue;
      }

      const convFromList = (liveState.conversations || []).find(c => c.id === convId);
      const meta = watcher.runningMeta.get(convId) || {};
      const convTitle = convFromList?.title || meta.title || 'Sesión';
      const projectName = convFromList?.projectName || meta.projectName || 'Antigravity';

      const assistantMsgs = (transcript.messages || []).filter(
        m => m.role === 'assistant' && m.content
      );
      const lastAssistant =
        assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
      const cleanPreview = lastAssistant
        ? stripMarkdownForNotification(lastAssistant.content)
        : 'Tarea finalizada en Antigravity.';

      const now = Date.now();
      updatedSteps[convId] = stepIdx;

      const notifPayload = {
        id: `done-${convId}-${now}`,
        title: `${projectName} • ${convTitle}`,
        conversationTitle: convTitle,
        sessionTitle: convTitle,
        body: cleanPreview || 'Tarea completada.',
        conversationId: convId,
        projectName,
        tag: `agy-done-${convId}`,
        ts: now,
        completedAt: now
      };

      watcher.recentCompletions.push(notifPayload);
      if (watcher.recentCompletions.length > 20) {
        watcher.recentCompletions.shift();
      }

      triggered.push(notifPayload);
      await sendPushNotificationToAll(notifPayload);
    }

    if (Object.keys(updatedSteps).length > 0) {
      const freshState = loadPushState();
      freshState.lastNotifiedStepByConv = {
        ...freshState.lastNotifiedStepByConv,
        ...updatedSteps
      };
      savePushState(freshState);
    }

    return triggered;
  } finally {
    watcher.inspecting = false;
  }
}

export function getRecentCompletions(sinceTs = 0) {
  const watcher = getWatcherGlobal();
  return watcher.recentCompletions.filter(c => c.ts > sinceTs);
}

export function ensureBackgroundPushWatcher() {
  if (process.env.VERCEL) return;
  const watcher = getWatcherGlobal();
  if (watcher.timer) return;

  watcher.timer = setInterval(async () => {
    if (watcher.polling) return;
    watcher.polling = true;
    try {
      const liveState = await getAntigravityLiveState();
      await inspectLiveStateForCompletions(liveState);
    } catch {
    } finally {
      watcher.polling = false;
    }
  }, 3200);

  if (typeof watcher.timer.unref === 'function') {
    watcher.timer.unref();
  }
}
