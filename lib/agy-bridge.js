import fs from 'fs';
import os from 'os';
import path from 'path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidConversationId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

export function normalizeConversationId(id) {
  const trimmed = String(id || '').trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export function getBrainDir() {
  if (process.env.AGY_BRAIN_DIR?.trim()) {
    return process.env.AGY_BRAIN_DIR.trim();
  }
  return path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
}

export function getDevToolsActivePortFile() {
  if (process.env.AGY_DEVTOOLS_PORT_FILE?.trim()) {
    return process.env.AGY_DEVTOOLS_PORT_FILE.trim();
  }
  const appData =
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Antigravity', 'DevToolsActivePort');
}

export function extractCleanUserText(rawContent) {
  const str = String(rawContent || '');
  if (!str) return '';
  if (str.includes('<SYSTEM_MESSAGE>') && !str.includes('<USER_REQUEST>')) {
    return '';
  }
  const matches = [...str.matchAll(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/gi)];
  if (matches.length > 0) {
    return matches
      .map(m => m[1].trim())
      .filter(Boolean)
      .join('\n\n');
  }
  if (str.includes('<CONTEXT_SUMMARY>')) {
    return '';
  }
  return str.trim();
}

export function summarizeToolCall(tc) {
  if (!tc || typeof tc !== 'object') return null;
  const rawName = String(tc.name || tc.tool_name || 'tool').replace(/^default_api:/, '');
  let args = tc.args || tc.arguments || {};
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = {};
    }
  }
  const summary =
    args.toolSummary ||
    args.Path ||
    args.CommandLine?.slice(0, 70) ||
    args.query ||
    args.Role ||
    rawName;
  return {
    name: rawName,
    summary: String(summary || rawName).slice(0, 100)
  };
}

export function parseTranscriptStepsToMessages(steps) {
  const messages = [];
  let currentAssistant = null;

  const flushAssistant = () => {
    if (!currentAssistant) return;
    if (
      currentAssistant.content ||
      currentAssistant.thinking.length > 0 ||
      currentAssistant.toolCalls.length > 0
    ) {
      messages.push(currentAssistant);
    }
    currentAssistant = null;
  };

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const type = step.type;
    const source = step.source;

    if (type === 'USER_INPUT' || source === 'USER_EXPLICIT') {
      const cleanUser = extractCleanUserText(step.content);
      if (!cleanUser) continue;
      flushAssistant();
      messages.push({
        id: `step-${step.step_index ?? messages.length}`,
        stepIndex: step.step_index ?? 0,
        role: 'user',
        content: cleanUser,
        createdAt: step.created_at || null
      });
      continue;
    }

    if (type === 'PLANNER_RESPONSE' && source === 'MODEL') {
      if (!currentAssistant) {
        currentAssistant = {
          id: `step-${step.step_index ?? messages.length}`,
          stepIndex: step.step_index ?? 0,
          role: 'assistant',
          content: '',
          thinking: [],
          toolCalls: [],
          status: step.status || 'DONE',
          createdAt: step.created_at || null
        };
      }
      currentAssistant.status = step.status || currentAssistant.status;
      if (step.created_at) currentAssistant.createdAt = step.created_at;

      const thinkText = String(step.thinking || '').trim();
      if (thinkText) {
        currentAssistant.thinking.push(thinkText);
      }

      if (Array.isArray(step.tool_calls)) {
        for (const tc of step.tool_calls) {
          const info = summarizeToolCall(tc);
          if (info) currentAssistant.toolCalls.push(info);
        }
      }

      const contentText = String(step.content || '').trim();
      if (contentText) {
        currentAssistant.content = currentAssistant.content
          ? `${currentAssistant.content}\n\n${contentText}`
          : contentText;
      }
    }
  }

  flushAssistant();
  return messages;
}

function readTailLines(filePath, maxBytes = 320 * 1024) {
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return [];
    const stat = fs.statSync(/*turbopackIgnore: true*/ filePath);
    if (stat.size <= 0) return [];
    const readSize = Math.min(stat.size, maxBytes);
    const startOffset = Math.max(0, stat.size - readSize);
    const fd = fs.openSync(/*turbopackIgnore: true*/ filePath, 'r');
    try {
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, startOffset);
      let text = buf.toString('utf8');
      if (startOffset > 0) {
        const firstNewline = text.indexOf('\n');
        if (firstNewline !== -1) {
          text = text.slice(firstNewline + 1);
        }
      }
      return text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

export function readConversationTranscript(conversationId, maxMessages = 60) {
  const safeId = normalizeConversationId(conversationId);
  if (!safeId) {
    return { messages: [], lastStepIndex: -1, updatedAt: null };
  }
  const logsDir = path.join(
    /*turbopackIgnore: true*/ getBrainDir(),
    safeId,
    '.system_generated',
    'logs'
  );
  const compactPath = path.join(/*turbopackIgnore: true*/ logsDir, 'transcript.jsonl');
  const fullPath = path.join(/*turbopackIgnore: true*/ logsDir, 'transcript_full.jsonl');

  const sourcePath = fs.existsSync(/*turbopackIgnore: true*/ fullPath)
    ? fullPath
    : compactPath;
  const rawLines = readTailLines(sourcePath, 512 * 1024);

  const steps = [];
  for (const line of rawLines) {
    try {
      steps.push(JSON.parse(line));
    } catch {}
  }

  const allMessages = parseTranscriptStepsToMessages(steps);
  const messages = allMessages.slice(-maxMessages);
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;

  let updatedAt = lastStep?.created_at || null;
  if (!updatedAt) {
    try {
      updatedAt = fs.statSync(/*turbopackIgnore: true*/ sourcePath).mtime.toISOString();
    } catch {}
  }

  return {
    messages,
    lastStepIndex: lastStep?.step_index ?? -1,
    lastStepType: lastStep?.type || null,
    lastStepStatus: lastStep?.status || null,
    updatedAt
  };
}

function readFirstUserPromptTitle(transcriptPath) {
  try {
    const fd = fs.openSync(/*turbopackIgnore: true*/ transcriptPath, 'r');
    try {
      const buf = Buffer.alloc(24 * 1024);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      const lines = buf
        .slice(0, bytesRead)
        .toString('utf8')
        .split(/\r?\n/)
        .filter(Boolean);
      for (const line of lines) {
        try {
          const step = JSON.parse(line);
          if (step.type === 'USER_INPUT' || step.source === 'USER_EXPLICIT') {
            const clean = extractCleanUserText(step.content);
            if (clean) {
              return clean.replace(/\s+/g, ' ').slice(0, 64);
            }
          }
        } catch {}
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  return null;
}

export async function runCdpPageEvaluation(expression, timeoutMs = 3500) {
  const portFile = getDevToolsActivePortFile();
  if (!fs.existsSync(/*turbopackIgnore: true*/ portFile)) {
    return {
      ok: false,
      error: 'Antigravity Desktop no está abierto (DevToolsActivePort no encontrado).'
    };
  }
  const lines = fs
    .readFileSync(/*turbopackIgnore: true*/ portFile, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { ok: false, error: 'Archivo DevToolsActivePort inválido.' };
  }
  const [port, wsPath] = lines;
  const wsUrl = `ws://127.0.0.1:${port}${wsPath}`;

  return new Promise(resolve => {
    let settled = false;
    let ws;
    const finish = res => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {}
      resolve(res);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Timeout conectando a Antigravity Desktop.' });
    }, timeoutMs);

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      return finish({ ok: false, error: err.message });
    }

    let sessionId = null;

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }));
    };

    ws.onerror = () => {
      finish({ ok: false, error: 'No se pudo conectar al puerto local de Antigravity.' });
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.error) {
          return finish({
            ok: false,
            error: msg.error.message || 'Error CDP en Antigravity.'
          });
        }
        if (msg.id === 1) {
          const infos = msg.result?.targetInfos || [];
          const page =
            infos.find(
              t => t.type === 'page' && /\/c\/|antigravity/i.test(t.url || t.title || '')
            ) || infos.find(t => t.type === 'page');
          if (!page) {
            return finish({ ok: false, error: 'No se encontró ventana activa de Antigravity.' });
          }
          ws.send(
            JSON.stringify({
              id: 2,
              method: 'Target.attachToTarget',
              params: { targetId: page.targetId, flatten: true }
            })
          );
        } else if (msg.id === 2) {
          sessionId = msg.result?.sessionId;
          if (!sessionId) {
            return finish({ ok: false, error: 'No se pudo adjuntar a la sesión de Antigravity.' });
          }
          ws.send(
            JSON.stringify({
              id: 3,
              sessionId,
              method: 'Runtime.evaluate',
              params: {
                expression,
                awaitPromise: true,
                returnByValue: true
              }
            })
          );
        } else if (msg.id === 3) {
          if (msg.result?.exceptionDetails) {
            return finish({
              ok: false,
              error: msg.result.exceptionDetails.text || 'Excepción en evaluación CDP.'
            });
          }
          const val = msg.result?.result?.value;
          finish({ ok: true, value: val });
        }
      } catch (err) {
        finish({ ok: false, error: err.message });
      }
    };
  });
}

export async function getAntigravityQuickStatus() {
  const expr = `(() => {
    const urlMatch = location.pathname.match(/\\/c\\/([0-9a-f-]{36})/i);
    const activeConversationId = urlMatch ? urlMatch[1] : null;
    const modelBtn = document.querySelector('button[aria-label^="Select model"]');
    const presetBtn = document.querySelector('button[aria-label^="Agent permissions preset selector"]');
    const cancelBtn = document.querySelector('button[aria-label*="Cancel"]');
    return JSON.stringify({
      activeConversationId,
      windowTitle: document.title || 'Antigravity',
      model: modelBtn ? (modelBtn.textContent || '').trim() : 'Gemini',
      preset: presetBtn ? (presetBtn.textContent || '').trim() : 'Turbo',
      isBusy: Boolean(cancelBtn)
    });
  })()`;

  const cdpRes = await runCdpPageEvaluation(expr, 2200);
  if (cdpRes.ok && cdpRes.value) {
    try {
      return { connected: true, ...JSON.parse(cdpRes.value) };
    } catch {}
  }
  return {
    connected: false,
    activeConversationId: null,
    windowTitle: 'Antigravity',
    model: 'Gemini',
    preset: 'Turbo',
    isBusy: false
  };
}

export async function getAntigravityLiveState() {
  const expr = `(() => {
    const urlMatch = location.pathname.match(/\\/c\\/([0-9a-f-]{36})/i);
    const activeConversationId = urlMatch ? urlMatch[1] : null;
    const modelBtn = document.querySelector('button[aria-label^="Select model"]');
    const presetBtn = document.querySelector('button[aria-label^="Agent permissions preset selector"]');
    const cancelBtn = document.querySelector('button[aria-label*="Cancel"]');
    const sidebarLinks = Array.from(document.querySelectorAll('a[href*="/c/"]')).map(a => {
      const m = (a.getAttribute('href') || '').match(/\\/c\\/([0-9a-f-]{36})/i);
      const id = m ? m[1] : null;
      const rawText = (a.parentElement?.textContent || a.textContent || '').trim();
      const cleanTitle = rawText.replace(/(\\d+[smhdw]|just now)$/i, '').trim();
      return id ? { id, title: cleanTitle } : null;
    }).filter(Boolean);
    return JSON.stringify({
      activeConversationId,
      windowTitle: document.title || 'Antigravity',
      model: modelBtn ? (modelBtn.textContent || '').trim() : 'Gemini',
      preset: presetBtn ? (presetBtn.textContent || '').trim() : 'Turbo',
      isBusy: Boolean(cancelBtn),
      sidebarConversations: sidebarLinks
    });
  })()`;

  const cdpRes = await runCdpPageEvaluation(expr, 2500);
  let live = {
    connected: false,
    activeConversationId: null,
    windowTitle: 'Antigravity',
    model: 'Gemini',
    preset: 'Turbo',
    isBusy: false,
    sidebarConversations: []
  };

  if (cdpRes.ok && cdpRes.value) {
    try {
      live = { connected: true, ...JSON.parse(cdpRes.value) };
    } catch {}
  }

  const sidebarTitleMap = new Map();
  for (const item of live.sidebarConversations || []) {
    if (item.id && item.title && !sidebarTitleMap.has(item.id)) {
      sidebarTitleMap.set(item.id, item.title);
    }
  }

  const brainDir = getBrainDir();
  const conversations = [];
  const seenIds = new Set();

  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ brainDir)) {
      const entries = fs.readdirSync(/*turbopackIgnore: true*/ brainDir, {
        withFileTypes: true
      });
      for (const entry of entries) {
        if (!entry.isDirectory() || !isValidConversationId(entry.name)) continue;
        const id = entry.name;
        const transcriptPath = path.join(
          /*turbopackIgnore: true*/
          brainDir,
          id,
          '.system_generated',
          'logs',
          'transcript.jsonl'
        );
        if (!fs.existsSync(/*turbopackIgnore: true*/ transcriptPath)) continue;
        const stat = fs.statSync(/*turbopackIgnore: true*/ transcriptPath);
        seenIds.add(id);
        const title =
          sidebarTitleMap.get(id) ||
          readFirstUserPromptTitle(transcriptPath) ||
          `Conversación ${id.slice(0, 8)}`;
        conversations.push({
          id,
          title,
          updatedAt: stat.mtime.toISOString(),
          mtimeMs: stat.mtimeMs,
          isActive: id === live.activeConversationId
        });
      }
    }
  } catch {}

  for (const [id, title] of sidebarTitleMap.entries()) {
    if (!seenIds.has(id)) {
      conversations.push({
        id,
        title,
        updatedAt: new Date().toISOString(),
        mtimeMs: Date.now(),
        isActive: id === live.activeConversationId
      });
    }
  }

  conversations.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.mtimeMs - a.mtimeMs;
  });

  return {
    connected: live.connected,
    activeConversationId: live.activeConversationId,
    windowTitle: live.windowTitle,
    model: live.model,
    preset: live.preset,
    isBusy: live.isBusy,
    conversations: conversations.slice(0, 25).map(({ mtimeMs: _m, ...rest }) => rest)
  };
}

export async function sendPromptToAntigravity(promptText, targetConversationId = null) {
  const cleanPrompt = String(promptText || '').trim();
  if (!cleanPrompt) {
    return { ok: false, error: 'El mensaje está vacío.' };
  }

  const portFile = getDevToolsActivePortFile();
  if (!fs.existsSync(/*turbopackIgnore: true*/ portFile)) {
    return { ok: false, error: 'Antigravity Desktop no está abierto en tu PC.' };
  }
  const lines = fs
    .readFileSync(/*turbopackIgnore: true*/ portFile, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { ok: false, error: 'Archivo DevToolsActivePort inválido.' };
  }
  const [port, wsPath] = lines;
  const wsUrl = `ws://127.0.0.1:${port}${wsPath}`;

  const isExplicitNew = targetConversationId === '__new__';
  const safeTargetId = isExplicitNew ? '' : normalizeConversationId(targetConversationId) || '';

  return new Promise(resolve => {
    let settled = false;
    let ws;
    const finish = res => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {}
      resolve(res);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Tiempo agotado al enviar mensaje a Antigravity.' });
    }, 6500);

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      return finish({ ok: false, error: err.message });
    }

    let sessionId = null;

    const sendCdp = (id, method, params = {}) => {
      ws.send(JSON.stringify({ id, sessionId, method, params }));
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Target.getTargets' }));
    };

    ws.onerror = () => {
      finish({ ok: false, error: 'Error de conexión WebSocket con Antigravity.' });
    };

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.error) {
          return finish({
            ok: false,
            error: msg.error.message || 'Error CDP al enviar mensaje.'
          });
        }
        if (msg.id === 1) {
          const infos = msg.result?.targetInfos || [];
          const page =
            infos.find(
              t => t.type === 'page' && /\/c\/|antigravity/i.test(t.url || t.title || '')
            ) || infos.find(t => t.type === 'page');
          if (!page) {
            return finish({ ok: false, error: 'No se encontró ventana de Antigravity.' });
          }
          ws.send(
            JSON.stringify({
              id: 2,
              method: 'Target.attachToTarget',
              params: { targetId: page.targetId, flatten: true }
            })
          );
        } else if (msg.id === 2) {
          sessionId = msg.result?.sessionId;
          if (!sessionId) {
            return finish({ ok: false, error: 'No se pudo adjuntar a la sesión de Antigravity.' });
          }
          const prepExpr = `(async () => {
            const targetId = ${JSON.stringify(safeTargetId)};
            if (targetId && !location.pathname.includes(targetId)) {
              const link = document.querySelector('a[href*="/c/' + targetId + '"]');
              if (link) {
                link.click();
                await new Promise(r => setTimeout(r, 320));
              }
            }
            const editor = document.querySelector('[aria-label="Message input"], [role="combobox"][contenteditable="true"], [contenteditable="true"]');
            if (!editor) return JSON.stringify({ ok: false, error: 'No se encontró la caja de texto en Antigravity.' });
            editor.focus();
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);
            return JSON.stringify({ ok: true });
          })()`;
          sendCdp(3, 'Runtime.evaluate', {
            expression: prepExpr,
            awaitPromise: true,
            returnByValue: true
          });
        } else if (msg.id === 3) {
          if (msg.result?.exceptionDetails) {
            return finish({
              ok: false,
              error: msg.result.exceptionDetails.text || 'Error preparando el editor.'
            });
          }
          const prepVal = JSON.parse(msg.result?.result?.value || '{"ok":false}');
          if (!prepVal.ok) {
            return finish(prepVal);
          }
          sendCdp(4, 'Input.insertText', { text: cleanPrompt });
        } else if (msg.id === 4) {
          setTimeout(() => {
            if (settled) return;
            sendCdp(5, 'Input.dispatchKeyEvent', {
              type: 'keyDown',
              key: 'Enter',
              code: 'Enter',
              windowsVirtualKeyCode: 13,
              nativeVirtualKeyCode: 13
            });
          }, 60);
        } else if (msg.id === 5) {
          sendCdp(6, 'Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Enter',
            code: 'Enter',
            windowsVirtualKeyCode: 13,
            nativeVirtualKeyCode: 13
          });
        } else if (msg.id === 6) {
          const readActiveIdExpr = `(async () => {
            await new Promise(r => setTimeout(r, 250));
            const m = location.pathname.match(/\\/c\\/([0-9a-f-]{36})/i);
            return m ? m[1] : null;
          })()`;
          sendCdp(7, 'Runtime.evaluate', {
            expression: readActiveIdExpr,
            awaitPromise: true,
            returnByValue: true
          });
        } else if (msg.id === 7) {
          const activeId = msg.result?.result?.value || null;
          finish({ ok: true, conversationId: activeId });
        }
      } catch (err) {
        finish({ ok: false, error: err.message });
      }
    };
  });
}

export async function performAntigravityAction(action, payload = {}) {
  if (action === 'switch_conversation') {
    const safeId = normalizeConversationId(payload.conversationId);
    if (!safeId) {
      return { ok: false, error: 'ID de conversación inválido.' };
    }
    const selectorLiteral = JSON.stringify(`a[href*="/c/${safeId}"]`);
    const expr = `(async () => {
      const link = document.querySelector(${selectorLiteral});
      if (link) {
        link.click();
        await new Promise(r => setTimeout(r, 200));
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({ ok: true, fallbackOnly: true });
    })()`;
    const res = await runCdpPageEvaluation(expr);
    return res.ok ? { ok: true } : res;
  }

  if (action === 'new_conversation') {
    const expr = `(async () => {
      const btn = document.querySelector('button[aria-label="New Conversation"]');
      if (!btn) return JSON.stringify({ ok: false, error: 'Botón New Conversation no encontrado.' });
      btn.click();
      await new Promise(r => setTimeout(r, 350));
      const m = location.pathname.match(/\\/c\\/([0-9a-f-]{36})/i);
      return JSON.stringify({ ok: true, conversationId: m ? m[1] : '__new__' });
    })()`;
    const res = await runCdpPageEvaluation(expr);
    if (!res.ok) return res;
    try {
      return JSON.parse(res.value);
    } catch {
      return { ok: true, conversationId: '__new__' };
    }
  }

  if (action === 'cancel') {
    const expr = `(() => {
      const btn = document.querySelector('button[aria-label*="Cancel"]');
      if (!btn) return JSON.stringify({ ok: false, error: 'No hay ejecución activa para cancelar.' });
      btn.click();
      return JSON.stringify({ ok: true });
    })()`;
    const res = await runCdpPageEvaluation(expr);
    if (!res.ok) return res;
    try {
      return JSON.parse(res.value);
    } catch {
      return { ok: true };
    }
  }

  return { ok: false, error: 'Acción desconocida.' };
}
