'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowUp,
  Square,
  RefreshCw,
  LogOut,
  X,
  Paperclip,
  PanelLeft,
  Bell,
  BellRing
} from 'lucide-react';

const TOKEN_STORAGE_KEY = 'agy_pocket_token_v1';
const LAST_CONV_STORAGE_KEY = 'agy_pocket_last_conv_v1';
const PUSH_PREF_STORAGE_KEY = 'agy_pocket_push_enabled_v1';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function AgyLogo({ size = 22, color = 'currentColor' }) {
  return (
    <svg
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
    >
      <path
        d="M144.248 149.062C151.748 154.688 162.998 150.938 152.685 140.625C121.748 110.625 128.31 28.125 89.8727 28.125C51.4352 28.125 57.9977 110.625 27.0602 140.625C15.8102 151.875 27.9977 154.688 35.4977 149.062C64.5602 129.375 62.6852 94.6875 89.8727 94.6875C117.06 94.6875 115.185 129.375 144.248 149.062Z"
        fill={color}
      />
    </svg>
  );
}

function AgyFolderIcon({ size = 16 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      style={{ flexShrink: 0 }}
    >
      <path d="M170-180q-29.15,0-49.58-20.42T100-250V-707.69q0-29.15 21.58-50.73T172.31-780H391.92l80,80H787.69q26.85,0 46.31,17.35T856.54-640H447.38l-80-80H172.31q-5.39,0-8.85,3.46T160-707.69v455.38q0,4.23 2.12,6.92t5.58,4.62L261-552.31H927.31L830.46-229.69q-6.85,22.54-25.65,36.11T763.08-180H170Zm60.54-60H770.77l75.46-252.31H306L230.54-240Zm0,0L306-492.31L230.54-240ZM160-640v-67.69q0-5.39 0-8.85t0-3.46v80Z" />
    </svg>
  );
}

function AgySpinnerIcon({ size = 15 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      className="agy-status-spinner"
      aria-label="Running"
    >
      <path d="M332.55-129.9q-69.29-29.9-121.02-81.63T129.9-332.55T100-480.35t29.96-147.5t81.58-120.61t121.04-81.58T480-860q12.75,0 21.37,8.63T510-829.99t-8.62,21.37T480-800q-133,0-226.5,93.5T160-480t93.5,226.5T480-160t226.5-93.5T800-480q0-12.77 8.63-21.38T830.01-510t21.37,8.62T860-480q0,77.99-29.96,147.42T748.46-211.54T627.85-129.96T480.35-100t-147.8-29.9Z" />
    </svg>
  );
}

function AgyThinkingSvg({ size = 18, active = true }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={active ? 'agy-thinking-svg is-active' : 'agy-thinking-svg'}
      aria-hidden="true"
    >
      {/* Outer organic rotating starburst ring (Claude / Antigravity style) */}
      <g className="agy-thinking-orbit">
        <path
          d="M18 2.5C19.1 9.4 20.6 11.8 25.8 10.2C22.4 14.9 23.6 16.9 33.5 18C23.6 19.1 22.4 21.1 25.8 25.8C20.6 24.2 19.1 26.6 18 33.5C16.9 26.6 15.4 24.2 10.2 25.8C13.6 21.1 12.4 19.1 2.5 18C12.4 16.9 13.6 14.9 10.2 10.2C15.4 11.8 16.9 9.4 18 2.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.38"
        />
      </g>
      {/* Inner pulsing Antigravity Delta-Arch */}
      <g className="agy-thinking-core" transform="translate(8, 8) scale(0.111)">
        <path
          d="M144.248 149.062C151.748 154.688 162.998 150.938 152.685 140.625C121.748 110.625 128.31 28.125 89.8727 28.125C51.4352 28.125 57.9977 110.625 27.0602 140.625C15.8102 151.875 27.9977 154.688 35.4977 149.062C64.5602 129.375 62.6852 94.6875 89.8727 94.6875C117.06 94.6875 115.185 129.375 144.248 149.062Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

function getLiveActivityLabel(messages, phaseTick) {
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  if (lastMsg && lastMsg.role === 'assistant') {
    if (lastMsg.content && lastMsg.content.trim().length > 0) {
      return 'Escribiendo';
    }
    const tools = Array.isArray(lastMsg.toolCalls) ? lastMsg.toolCalls : [];
    if (tools.length > 0) {
      const lastTool = tools[tools.length - 1];
      const name = String(lastTool.name || '').toLowerCase();
      const summary = String(lastTool.summary || '').trim();
      if (name.includes('read') || name.includes('grep') || name.includes('search')) {
        return summary ? `Analizando ${summary}` : 'Analizando código';
      }
      if (name.includes('edit') || name.includes('write')) {
        return summary ? `Editando ${summary}` : 'Escribiendo cambios';
      }
      if (name.includes('command')) {
        return summary ? `Ejecutando ${summary}` : 'Ejecutando en tu PC';
      }
      return summary ? `${summary}` : 'Procesando';
    }
    if (Array.isArray(lastMsg.thinking) && lastMsg.thinking.length > 0) {
      return 'Pensando';
    }
  }
  const phases = ['Pensando', 'Analizando', 'Escribiendo'];
  return phases[phaseTick % phases.length];
}

function AgyLiveActivityIndicator({ messages, onCancel }) {
  const [phaseTick, setPhaseTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhaseTick(t => t + 1);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const label = getLiveActivityLabel(messages, phaseTick);

  return (
    <div className="agy-live-indicator" role="status" aria-live="polite">
      <div className="agy-live-left">
        <AgyThinkingSvg size={20} active={true} />
        <span className="agy-live-shimmer">{label}</span>
        <span className="agy-live-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      {onCancel && (
        <button
          type="button"
          className="agy-live-stop"
          onClick={onCancel}
          aria-label="Detener"
          title="Detener"
        >
          Stop
        </button>
      )}
    </div>
  );
}

function splitMarkdownBlocks(rawText) {
  const str = String(rawText || '');
  const parts = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = fenceRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'prose',
        text: str.slice(lastIndex, match.index).trim()
      });
    }
    parts.push({
      type: 'code',
      lang: match[1] || 'code',
      code: match[2].replace(/\n$/, '')
    });
    lastIndex = fenceRegex.lastIndex;
  }

  if (lastIndex < str.length) {
    const tail = str.slice(lastIndex).trim();
    if (tail) parts.push({ type: 'prose', text: tail });
  }

  return parts;
}

function renderInlineMarkdown(text, keyPrefix = 'in') {
  const str = String(text || '');
  if (!str) return null;

  // Match earliest markdown link, bold (**...**), inline code (`...`), or italic (*...*)
  const tokenRegex =
    /(\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\))|(\*\*([\s\S]+?)\*\*)|(`([^`\n]+)`)|((?<!\*)\*([^*\n]+)\*(?!\*))/g;

  const nodes = [];
  let lastIdx = 0;
  let match;
  let tokenIdx = 0;

  while ((match = tokenRegex.exec(str)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(str.slice(lastIdx, match.index));
    }
    const key = `${keyPrefix}-${tokenIdx++}`;

    if (match[1]) {
      // Link: [label](url)
      const label = match[2];
      const url = match[3];
      const isLocalFile =
        /^(file|conversation):\/\//i.test(url) || /^[a-zA-Z]:[\\/]/.test(url);
      if (isLocalFile) {
        nodes.push(
          <span key={key} className="md-file-pill">
            {renderInlineMarkdown(label, `${key}-lbl`)}
          </span>
        );
      } else if (/^https?:\/\//i.test(url)) {
        nodes.push(
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="md-link"
          >
            {renderInlineMarkdown(label, `${key}-lbl`)}
          </a>
        );
      } else {
        nodes.push(
          <span key={key} className="md-file-pill">
            {renderInlineMarkdown(label, `${key}-lbl`)}
          </span>
        );
      }
    } else if (match[4]) {
      // Bold: **inner**
      nodes.push(
        <strong key={key} className="md-strong">
          {renderInlineMarkdown(match[5], `${key}-b`)}
        </strong>
      );
    } else if (match[6]) {
      // Inline code: `code`
      nodes.push(
        <code key={key} className="inline-code">
          {match[7]}
        </code>
      );
    } else if (match[8]) {
      // Italic: *inner*
      nodes.push(
        <em key={key} className="md-em">
          {renderInlineMarkdown(match[9], `${key}-i`)}
        </em>
      );
    }

    lastIdx = tokenRegex.lastIndex;
  }

  if (lastIdx < str.length) {
    nodes.push(str.slice(lastIdx));
  }

  return nodes;
}

function parseProseBlocks(proseText) {
  const lines = String(proseText || '').split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Heading (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim()
      });
      i++;
      continue;
    }

    // Unordered list (- or *)
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(/^\s*[-*]\s+(.*)$/);
        if (m) {
          items.push(m[1].trim());
          i++;
        } else if (items.length > 0 && /^\s{2,}\S/.test(l) && !/^\s*\d+\.\s+/.test(l)) {
          items[items.length - 1] += ` ${l.trim()}`;
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list (1. 2. ...)
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = l.match(/^\s*\d+\.\s+(.*)$/);
        if (m) {
          items.push(m[1].trim());
          i++;
        } else if (items.length > 0 && /^\s{2,}\S/.test(l) && !/^\s*[-*]\s+/.test(l)) {
          items[items.length - 1] += ` ${l.trim()}`;
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Blockquote (> ...)
    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n').trim() });
      continue;
    }

    // Standard paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|[-*]\s+|\d+\.\s+|>\s?|---|\*\*\*|___)/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'p', text: paraLines.join('\n') });
    } else {
      i++;
    }
  }

  return blocks;
}

function AssistantMessageBody({ content }) {
  const [copiedIdx, setCopiedIdx] = useState(null);
  const blocks = useMemo(() => splitMarkdownBlocks(content), [content]);

  const handleCopy = (code, idx) => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="assistant-prose">
      {blocks.map((b, idx) => {
        if (b.type === 'code') {
          return (
            <div key={idx} className="code-block-card">
              <div className="code-block-header">
                <span>{b.lang}</span>
                <button
                  type="button"
                  className="code-copy-btn"
                  onClick={() => handleCopy(b.code, idx)}
                  aria-label="Copiar código"
                  title="Copiar código"
                >
                  {copiedIdx === idx ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <pre className="code-block-pre">{b.code}</pre>
            </div>
          );
        }

        const subBlocks = parseProseBlocks(b.text);
        return (
          <React.Fragment key={idx}>
            {subBlocks.map((sb, sIdx) => {
              const key = `${idx}-${sIdx}`;
              if (sb.type === 'heading') {
                const Tag = sb.level === 1 ? 'h2' : sb.level === 2 ? 'h3' : 'h4';
                return (
                  <Tag key={key} className={`md-heading md-h${sb.level}`}>
                    {renderInlineMarkdown(sb.text, key)}
                  </Tag>
                );
              }
              if (sb.type === 'ul') {
                return (
                  <ul key={key} className="md-list">
                    {sb.items.map((item, liIdx) => (
                      <li key={liIdx}>
                        {renderInlineMarkdown(item, `${key}-li-${liIdx}`)}
                      </li>
                    ))}
                  </ul>
                );
              }
              if (sb.type === 'ol') {
                return (
                  <ol key={key} className="md-list md-list-ol">
                    {sb.items.map((item, liIdx) => (
                      <li key={liIdx}>
                        {renderInlineMarkdown(item, `${key}-oli-${liIdx}`)}
                      </li>
                    ))}
                  </ol>
                );
              }
              if (sb.type === 'blockquote') {
                return (
                  <blockquote key={key} className="md-quote">
                    {renderInlineMarkdown(sb.text, key)}
                  </blockquote>
                );
              }
              if (sb.type === 'hr') {
                return <hr key={key} className="md-hr" />;
              }
              return (
                <p key={key} className="md-p">
                  {renderInlineMarkdown(sb.text, key)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function compressImageIfNeeded(file, dataUrl) {
  return new Promise(resolve => {
    if (!file.type.startsWith('image/') || file.size <= 1.8 * 1024 * 1024) {
      resolve({ dataUrl, mimeType: file.type || 'image/png' });
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.84);
        resolve({ dataUrl: compressedUrl, mimeType: 'image/jpeg' });
      } catch {
        resolve({ dataUrl, mimeType: file.type || 'image/png' });
      }
    };
    img.onerror = () => resolve({ dataUrl, mimeType: file.type || 'image/png' });
    img.src = dataUrl;
  });
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const isImage = Boolean(file.type && file.type.startsWith('image/'));
    const maxBytes = isImage ? 12 * 1024 * 1024 : 3 * 1024 * 1024;
    if (file.size > maxBytes) {
      reject(
        new Error(
          `El archivo ${file.name} supera el límite de ${isImage ? '12 MB' : '3 MB'}.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = String(reader.result || '');
      const { dataUrl, mimeType } = isImage
        ? await compressImageIfNeeded(file, rawDataUrl)
        : { dataUrl: rawDataUrl, mimeType: file.type || 'application/octet-stream' };
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
      if (base64.length > 4 * 1024 * 1024) {
        reject(new Error(`El archivo ${file.name} sigue superando los 3 MB tras comprimir.`));
        return;
      }
      resolve({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name || 'imagen.png',
        type: mimeType,
        dataUrl: isImage ? dataUrl : null,
        dataBase64: base64
      });
    };
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const ANTIGRAVITY_MODELS = [
  {
    base: 'Gemini 4 Argon',
    badge: 'New',
    defaultEffort: 'High',
    efforts: ['Low', 'Medium', 'High']
  },
  {
    base: 'Gemini 3.8 Flash',
    badge: 'Fast',
    defaultEffort: 'Medium',
    efforts: ['Low', 'Medium', 'High']
  },
  {
    base: 'Claude Opus 5.5',
    badge: 'New',
    defaultEffort: 'Medium',
    efforts: ['Low', 'Medium', 'High']
  },
  {
    base: 'Claude Sonnet 5.5',
    badge: 'New',
    defaultEffort: 'Medium',
    efforts: ['Low', 'Medium', 'High']
  },
  {
    base: 'GPT-OSS 120B (Medium)',
    badge: 'Notice',
    defaultEffort: null,
    efforts: []
  }
];

export default function AgyPocketPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [connected, setConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [model, setModel] = useState('Gemini 4 Argon High');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [preset, setPreset] = useState('Turbo');
  const [projects, setProjects] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState('');
  const [optimisticConvId, setOptimisticConvId] = useState('');

  const [messages, setMessages] = useState([]);
  const [optimisticPrompts, setOptimisticPrompts] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [sendError, setSendError] = useState('');

  const [pushStatus, setPushStatus] = useState('inactive'); // 'inactive' | 'active' | 'local'
  const [pushLoading, setPushLoading] = useState(false);
  const [pushNotice, setPushNotice] = useState('');
  const [completionToast, setCompletionToast] = useState(null);

  const chatScrollRef = useRef(null);
  const sidebarDialogRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const latestReqIdRef = useRef(0);
  const seenCompletionsRef = useRef(new Set());

  const getAuthHeaders = useCallback(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const syncTextareaHeight = useCallback(el => {
    if (!el) return;
    el.style.height = 'auto';
    const sh = el.scrollHeight;
    const clamped = Math.min(180, Math.max(24, sh));
    el.style.height = `${clamped}px`;
    el.style.overflowY = sh > 180 ? 'auto' : 'hidden';
  }, []);

  const processRecentCompletions = useCallback(
    recentList => {
      if (!Array.isArray(recentList) || recentList.length === 0) return;
      for (const item of recentList) {
        const completedAt = item?.completedAt || item?.ts;
        if (!item?.conversationId || !completedAt) continue;
        // Only surface completions that happened in the last 25 seconds
        if (Date.now() - completedAt > 25000) continue;
        const key = `${item.conversationId}:${completedAt}`;
        if (seenCompletionsRef.current.has(key)) continue;
        seenCompletionsRef.current.add(key);

        const sessionTitle =
          item.conversationTitle || item.sessionTitle || item.title || 'Sesión completada';
        const projName = item.projectName || 'Antigravity';
        const bodyText = item.body || 'Antigravity terminó la tarea.';

        setCompletionToast({
          conversationId: item.conversationId,
          title: sessionTitle,
          projectName: projName,
          body: bodyText
        });

        // Local notification fallback when running in 'local' mode and tab is backgrounded
        if (
          pushStatus === 'local' &&
          typeof document !== 'undefined' &&
          document.visibilityState !== 'visible' &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          const notifTitle = `${projName} • ${sessionTitle}`;
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready
              .then(reg =>
                reg.showNotification(notifTitle, {
                  body: bodyText,
                  icon: '/icon.svg',
                  badge: '/icon.svg',
                  tag: `agy-done-${item.conversationId}`,
                  data: { conversationId: item.conversationId }
                })
              )
              .catch(() => {});
          }
        }
      }
    },
    [pushStatus]
  );

  const syncPushStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        const existingSub = await reg.pushManager.getSubscription();
        if (
          existingSub &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          setPushStatus('active');
          localStorage.setItem(PUSH_PREF_STORAGE_KEY, '1');
          fetch('/api/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({
              action: 'subscribe',
              subscription: existingSub.toJSON(),
              sendWelcome: false,
              userAgent: navigator.userAgent
            })
          }).catch(() => {});
          return;
        }
      }
      if (localStorage.getItem(PUSH_PREF_STORAGE_KEY) === '1') {
        if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          setPushStatus('local');
          return;
        }
      }
      setPushStatus('inactive');
    } catch {
      setPushStatus('inactive');
    }
  }, [getAuthHeaders]);

  const handleDisablePush = useCallback(async () => {
    setPushLoading(true);
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          const endpoint = existingSub.endpoint;
          await existingSub.unsubscribe().catch(() => {});
          await fetch('/api/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({ action: 'unsubscribe', endpoint })
          }).catch(() => {});
        }
      }
      localStorage.removeItem(PUSH_PREF_STORAGE_KEY);
      setPushStatus('inactive');
      setPushNotice('Notificaciones desactivadas.');
    } catch {
      localStorage.removeItem(PUSH_PREF_STORAGE_KEY);
      setPushStatus('inactive');
    } finally {
      setPushLoading(false);
    }
  }, [getAuthHeaders]);

  const handleTogglePush = useCallback(async () => {
    if (pushLoading) return;
    setPushLoading(true);
    setPushNotice('');
    try {
      // If already active, send a live test push so the user can verify on their device
      if (pushStatus === 'active' || pushStatus === 'local') {
        if (pushStatus === 'active') {
          const res = await fetch('/api/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders()
            },
            body: JSON.stringify({ action: 'test', conversationId: selectedConvId || null })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.ok) {
            setPushNotice('Alertas Push activas · Se envió una notificación de prueba.');
          } else {
            setPushNotice('Alertas Push activas para todas tus sesiones.');
          }
        } else {
          setPushNotice(
            'Alertas en vivo activas. En iPhone: usá Compartir → Agregar a pantalla de inicio para recibir Push con pantalla bloqueada.'
          );
        }
        return;
      }

      if (typeof Notification !== 'undefined') {
        const perm = await Notification.requestPermission();
        if (perm === 'denied') {
          setPushNotice(
            'Permiso de notificaciones bloqueado en el navegador. Habilitalo en Ajustes del sitio.'
          );
          return;
        }
      }

      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        if (reg.pushManager) {
          const keyRes = await fetch('/api/push', { headers: getAuthHeaders() });
          const keyData = await keyRes.json().catch(() => ({}));
          if (keyRes.ok && keyData.publicKey) {
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
              });
            }
            const subRes = await fetch('/api/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
              },
              body: JSON.stringify({
                action: 'subscribe',
                subscription: sub.toJSON(),
                sendWelcome: true,
                userAgent: navigator.userAgent
              })
            });
            if (subRes.ok) {
              localStorage.setItem(PUSH_PREF_STORAGE_KEY, '1');
              setPushStatus('active');
              setPushNotice(
                '¡Notificaciones Push activadas! Te avisaremos cuando termine cualquier sesión.'
              );
              return;
            }
          }
        }
      }

      // Fallback when iOS Safari is opened outside standalone Home Screen PWA mode
      localStorage.setItem(PUSH_PREF_STORAGE_KEY, '1');
      setPushStatus('local');
      setPushNotice(
        'Alertas en vivo activas. En iPhone: tocá Compartir → Agregar a pantalla de inicio para recibir Push con pantalla bloqueada.'
      );
    } catch {
      localStorage.setItem(PUSH_PREF_STORAGE_KEY, '1');
      setPushStatus('local');
      setPushNotice(
        'Alertas en vivo activas. Para Push con pantalla bloqueada en iOS, abrí la app desde tu Pantalla de inicio.'
      );
    } finally {
      setPushLoading(false);
    }
  }, [pushLoading, pushStatus, selectedConvId, getAuthHeaders]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
    const urlConvId = params?.get('conversationId') || '';
    const savedConv = urlConvId || localStorage.getItem(LAST_CONV_STORAGE_KEY) || '';
    if (savedConv && savedConv !== '__new__') {
      setSelectedConvId(savedConv);
      setOptimisticConvId(savedConv);
    }

    const existingToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (existingToken) {
      setAuthenticated(true);
      setAuthChecked(true);
    }

    fetch('/api/auth', { headers: getAuthHeaders() })
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          if (data.token) localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
          setAuthenticated(true);
        } else if (res.status === 401) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setAuthenticated(false);
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!authenticated) return;
    syncPushStatus();
  }, [authenticated, syncPushStatus]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { headers: getAuthHeaders() });
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setConnected(Boolean(data.connected));
      setIsBusy(Boolean(data.isBusy));
      if (data.model) setModel(data.model);
      if (data.preset) setPreset(data.preset);
      if (data.recentCompletions) {
        processRecentCompletions(data.recentCompletions);
      }

      const projList = Array.isArray(data.projects) ? data.projects : [];
      setProjects(prev =>
        projList.length === 0 && data.bridgeError && prev.length > 0 ? prev : projList
      );

      const list = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(prev =>
        list.length === 0 && data.bridgeError && prev.length > 0 ? prev : list
      );

      setSelectedConvId(prev => {
        if (prev === '__new__') return prev;
        const nextId = prev || data.activeConversationId || list[0]?.id || '';
        if (nextId && nextId !== '__new__') {
          localStorage.setItem(LAST_CONV_STORAGE_KEY, nextId);
        }
        return nextId;
      });
    } catch {}
  }, [getAuthHeaders, processRecentCompletions]);

  const fetchMessages = useCallback(
    async targetId => {
      const convId = targetId || selectedConvId;
      const reqId = ++latestReqIdRef.current;
      try {
        const url = convId
          ? `/api/messages?conversationId=${encodeURIComponent(convId)}&limit=70`
          : '/api/messages?limit=70';
        const res = await fetch(url, { headers: getAuthHeaders() });
        if (reqId !== latestReqIdRef.current) return;
        if (res.status === 401) {
          setAuthenticated(false);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (reqId !== latestReqIdRef.current) return;

        setConnected(Boolean(data.connected));
        setIsBusy(Boolean(data.isBusy));
        if (data.model) setModel(data.model);
        if (data.preset) setPreset(data.preset);
        if (data.recentCompletions) {
          processRecentCompletions(data.recentCompletions);
        }
        if (
          (!convId || convId === '__new__') &&
          data.conversationId &&
          data.conversationId !== '__new__'
        ) {
          setSelectedConvId(data.conversationId);
          setOptimisticConvId(data.conversationId);
          localStorage.setItem(LAST_CONV_STORAGE_KEY, data.conversationId);
        }

        const serverMsgs = Array.isArray(data.messages) ? data.messages : [];
        setMessages(prev =>
          serverMsgs.length === 0 && data.bridgeError && prev.length > 0
            ? prev
            : serverMsgs
        );

        setOptimisticPrompts(prev => {
          if (prev.length === 0) return prev;
          const recentUsers = serverMsgs.filter(m => m.role === 'user').slice(-8);
          const recentUserTexts = new Set(
            recentUsers.map(m => (m.content || '').trim()).filter(Boolean)
          );
          const recentMediaCount = recentUsers.reduce(
            (acc, m) => acc + (Array.isArray(m.media) ? m.media.length : 0),
            0
          );
          return prev.filter(p => {
            const trimmed = (p.content || '').trim();
            if (trimmed) {
              return !recentUserTexts.has(trimmed) && Date.now() - p.ts < 25000;
            }
            return recentMediaCount === 0 && Date.now() - p.ts < 8000;
          });
        });
      } catch {
      } finally {
        if (reqId === latestReqIdRef.current) {
          setLoadingMessages(false);
        }
      }
    },
    [selectedConvId, getAuthHeaders, processRecentCompletions]
  );

  useEffect(() => {
    if (!authenticated) return;
    fetchConversations();
    fetchMessages(selectedConvId);

    const intervalMs = isBusy ? 1400 : 2800;
    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchMessages(selectedConvId);
    }, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchConversations();
        fetchMessages(selectedConvId);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [authenticated, selectedConvId, isBusy, fetchConversations, fetchMessages]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, optimisticPrompts.length, isBusy]);

  const handleScroll = e => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 110;
  };

  const handleLogin = async e => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLoginError(data.error || 'PIN inválido');
        return;
      }
      if (data.token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      }
      setAuthenticated(true);
      setPin('');
    } catch {
      setLoginError('Error de red al iniciar sesión');
    }
  };

  const handleFilesSelected = async fileList => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setSendError('');
    try {
      const loaded = await Promise.all(files.slice(0, 6).map(readFileAsAttachment));
      setPendingAttachments(prev => [...prev, ...loaded].slice(0, 6));
    } catch (err) {
      setSendError(err.message || 'No se pudo cargar el archivo.');
    }
  };

  const handlePaste = async e => {
    const items = Array.from(e.clipboardData?.items || []);
    const fileItems = items.filter(it => it.kind === 'file');
    if (fileItems.length === 0) return;
    const files = fileItems.map(it => it.getAsFile()).filter(Boolean);
    if (files.length > 0) {
      e.preventDefault();
      await handleFilesSelected(files);
    }
  };

  const handleRemoveAttachment = id => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSend = async overrideText => {
    const text = String(overrideText ?? inputText).trim();
    const attachmentsToSend = overrideText !== undefined ? [] : pendingAttachments;
    if (!text && attachmentsToSend.length === 0) return;

    setSendError('');
    const tempId = `opt-${Date.now()}`;
    stickToBottomRef.current = true;

    // 0ms optimistic insert and input clear
    setOptimisticPrompts(prev => [
      ...prev,
      {
        id: tempId,
        content: text,
        attachments: attachmentsToSend,
        ts: Date.now()
      }
    ]);
    if (overrideText === undefined) {
      setInputText('');
      setPendingAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
    setIsBusy(true);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          conversationId: selectedConvId || null,
          text,
          attachments: attachmentsToSend.map(a => ({
            name: a.name,
            type: a.type,
            dataBase64: a.dataBase64
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const fallbackErr =
          res.status === 413
            ? 'El archivo supera el límite de tamaño permitido (máx. 3 MB).'
            : 'No se pudo enviar a Antigravity';
        setSendError(data.error || fallbackErr);
        setOptimisticPrompts(prev => prev.filter(p => p.id !== tempId));
        setIsBusy(false);
        return;
      }
      const nextConvId =
        data.conversationId && data.conversationId !== '__new__'
          ? data.conversationId
          : selectedConvId;
      if (nextConvId && nextConvId !== '__new__' && nextConvId !== selectedConvId) {
        setSelectedConvId(nextConvId);
        setOptimisticConvId(nextConvId);
        localStorage.setItem(LAST_CONV_STORAGE_KEY, nextConvId);
      }
      setTimeout(() => fetchMessages(nextConvId), 550);
    } catch {
      setSendError('Sin conexión con tu PC. Reintentando...');
      setOptimisticPrompts(prev => prev.filter(p => p.id !== tempId));
      setIsBusy(false);
    }
  };

  const handleSelectConversation = useCallback(
    async convId => {
      const isSame = convId === selectedConvId;
      setOptimisticConvId(convId);
      setSelectedConvId(convId);
      if (convId && convId !== '__new__') {
        localStorage.setItem(LAST_CONV_STORAGE_KEY, convId);
      }
      sidebarDialogRef.current?.close();
      if (!isSame) {
        setMessages([]);
        setOptimisticPrompts([]);
        setLoadingMessages(true);
      }
      stickToBottomRef.current = true;

      fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ action: 'switch_conversation', conversationId: convId })
      }).catch(() => {});

      if (isSame) {
        fetchMessages(convId);
      }
    },
    [selectedConvId, getAuthHeaders, fetchMessages]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const onSwMessage = event => {
      const msg = event?.data;
      if (msg?.type === 'AGY_OPEN_CONVERSATION' && msg.conversationId) {
        handleSelectConversation(msg.conversationId);
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onSwMessage);
  }, [handleSelectConversation]);

  const handleToggleProject = async projectName => {
    setProjects(prev =>
      prev.map(p => (p.name === projectName ? { ...p, expanded: !p.expanded } : p))
    );
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ action: 'toggle_project', projectName })
      });
      await fetchConversations();
    } catch {}
  };

  const handleNewConversation = async (projectName = null) => {
    sidebarDialogRef.current?.close();
    setMessages([]);
    setOptimisticPrompts([]);
    setSelectedConvId('__new__');
    setOptimisticConvId('__new__');
    setLoadingMessages(false);
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(
          projectName
            ? { action: 'new_conversation_in_project', projectName }
            : { action: 'new_conversation' }
        )
      });
      const data = await res.json();
      if (data.conversationId && data.conversationId !== '__new__') {
        setSelectedConvId(data.conversationId);
        setOptimisticConvId(data.conversationId);
        localStorage.setItem(LAST_CONV_STORAGE_KEY, data.conversationId);
      }
      fetchConversations();
    } catch {}
  };

  const handleSelectModel = async (modelBase, effort = null) => {
    const optimisticLabel = effort ? `${modelBase} ${effort}` : modelBase;
    setModel(optimisticLabel);
    setModelMenuOpen(false);
    try {
      const res = await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          action: 'select_model',
          modelBase,
          effort
        })
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.model) {
        setModel(data.model);
      }
    } catch {}
  };

  const handleCancelRun = async () => {
    try {
      await fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ action: 'cancel' })
      });
      setIsBusy(false);
    } catch {}
  };

  const handleLogout = async () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    }).catch(() => {});
    setAuthenticated(false);
  };

  const activeConvObj = useMemo(() => {
    const id = optimisticConvId || selectedConvId;
    if (id === '__new__') {
      return { id: '__new__', title: 'New Conversation', projectName: 'Antigravity' };
    }
    return conversations.find(c => c.id === id) || conversations[0] || null;
  }, [conversations, optimisticConvId, selectedConvId]);

  const ungroupedConversations = useMemo(() => {
    const inProjects = new Set();
    for (const p of projects) {
      for (const c of p.conversations || []) {
        inProjects.add(c.id);
      }
    }
    return conversations.filter(c => !inProjects.has(c.id));
  }, [projects, conversations]);

  if (!authChecked) {
    return <main className="app-shell" />;
  }

  if (!authenticated) {
    return (
      <main className="app-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <AgyLogo size={38} color="#101010" />
          </div>
          <h1>Antigravity</h1>
          <p>Sesión permanente conectada en vivo a tu PC.</p>
          <input
            type="password"
            inputMode="numeric"
            className="pin-input"
            placeholder="PIN de acceso"
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
          />
          {loginError ? (
            <p style={{ color: '#dc2626', fontSize: '0.8rem', marginBottom: 10 }}>
              {loginError}
            </p>
          ) : null}
          <button type="submit" className="pin-submit">
            Entrar a Antigravity
          </button>
        </form>
      </main>
    );
  }

  const canSend = Boolean(inputText.trim() || pendingAttachments.length > 0);

  return (
    <main className="app-shell">
      <header className="top-header">
        <button
          type="button"
          className="sidebar-trigger-btn"
          onPointerDown={fetchConversations}
          onClick={() => {
            fetchConversations();
            sidebarDialogRef.current?.showModal();
          }}
          aria-label="Abrir proyectos y sesiones"
          title="Abrir proyectos y sesiones"
        >
          <PanelLeft size={18} color="#4a4a4a" />
          <AgyLogo size={20} color="#101010" />
          <div className="header-title-wrap">
            <div className="header-project-crumb">
              {activeConvObj?.projectName || 'Projects'}
            </div>
            <div className="header-conv-title">
              {activeConvObj?.title || 'Antigravity'}
            </div>
          </div>
          {isBusy ? (
            <AgySpinnerIcon size={15} />
          ) : (
            <span className={`status-dot ${connected ? 'online' : ''}`} />
          )}
        </button>

        <div className="header-actions">
          <button
            type="button"
            className={`push-indicator-btn ${
              pushStatus === 'active' || pushStatus === 'local' ? 'is-active' : 'is-inactive'
            }`}
            onClick={handleTogglePush}
            disabled={pushLoading}
            aria-label={
              pushStatus === 'active' || pushStatus === 'local'
                ? 'Notificaciones activas (tocar para probar)'
                : 'Activar notificaciones push'
            }
            title={
              pushStatus === 'active' || pushStatus === 'local'
                ? 'Notificaciones activas (tocar para enviar prueba)'
                : 'Activar notificaciones cuando termine una tarea en cualquier sesión'
            }
          >
            {pushStatus === 'active' || pushStatus === 'local' ? (
              <>
                <span className="push-dot active" />
                <BellRing size={13} />
                <span className="push-label">Alertas ON</span>
              </>
            ) : (
              <>
                <span className="push-dot inactive" />
                <Bell size={13} />
                <span className="push-label">
                  {pushLoading ? 'Activando...' : 'Activar notificaciones'}
                </span>
              </>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => handleNewConversation(activeConvObj?.projectName || null)}
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              fetchConversations();
              fetchMessages(selectedConvId);
            }}
            aria-label="Actualizar"
            title="Actualizar"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {pushNotice && (
        <div className="status-banner push-banner">
          <div className="status-banner-copy">
            <strong>Notificaciones</strong>
            <span>{pushNotice}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {(pushStatus === 'active' || pushStatus === 'local') && (
              <button
                type="button"
                className="pill-btn"
                onClick={handleDisablePush}
                disabled={pushLoading}
              >
                Desactivar
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setPushNotice('')}
              aria-label="Cerrar aviso"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {completionToast && (
        <div className="status-banner completion-banner">
          <div className="status-banner-copy">
            <strong>
              Tarea terminada · {completionToast.projectName} — {completionToast.title}
            </strong>
            <span>{completionToast.body}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {completionToast.conversationId !== selectedConvId && (
              <button
                type="button"
                className="pill-btn"
                onClick={() => {
                  const target = completionToast.conversationId;
                  setCompletionToast(null);
                  handleSelectConversation(target);
                }}
              >
                Abrir sesión
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setCompletionToast(null)}
              aria-label="Cerrar notificación"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {sendError && (
        <div className="status-banner">
          <div className="status-banner-copy">
            <strong>Aviso</strong>
            <span>{sendError}</span>
          </div>
        </div>
      )}

      <section
        ref={chatScrollRef}
        className="chat-scroll"
        onScroll={handleScroll}
      >
        {loadingMessages && messages.length === 0 ? (
          <>
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </>
        ) : messages.length === 0 && optimisticPrompts.length === 0 && !isBusy ? (
          <div className="empty-hero">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <AgyLogo size={42} color="#101010" />
            </div>
            <h1>Antigravity</h1>
            <p>
              Escribí un mensaje o subí una foto/archivo para ejecutarlo en vivo en tu PC.
            </p>
            <div className="quick-chips">
              {[
                'Revisá el git status y últimos cambios',
                'Corré los tests del proyecto activo',
                'Explicame en qué quedamos'
              ].map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  className="quick-chip"
                  onClick={() => handleSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, idx) => {
              const isLast = idx === messages.length - 1;
              const isDeferred = idx < messages.length - 12;
              if (m.role === 'user') {
                return (
                  <div
                    key={m.id}
                    className={`msg-row ${isDeferred ? 'deferred' : ''}`}
                  >
                    <div className="msg-user-outer">
                      <div className="msg-user-card">
                        {m.media?.length > 0 && (
                          <div className="msg-media-strip">
                            {m.media.map((med, mIdx) => (
                              <span key={mIdx} className="msg-media-badge">
                                <Paperclip size={11} />
                                {med.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {m.content ? <div>{m.content}</div> : null}
                      </div>
                    </div>
                  </div>
                );
              }

              // If the assistant is currently working on the last turn and hasn't emitted prose yet,
              // let the live SVG activity indicator at the bottom represent this active turn cleanly.
              if (isLast && isBusy && !m.content) {
                return null;
              }

              const editedFilesCount = Array.isArray(m.toolCalls)
                ? new Set(
                    m.toolCalls
                      .filter(tc => tc.name === 'edit_file' || tc.name === 'write_file')
                      .map(tc => tc.summary)
                      .filter(Boolean)
                  ).size
                : 0;

              return (
                <div
                  key={m.id}
                  className={`msg-row msg-assistant ${isDeferred ? 'deferred' : ''}`}
                >
                  {m.thinking?.length > 0 && (
                    <details className="trace-details">
                      <summary className="trace-summary">
                        <span>Worked</span>
                        <ChevronRight size={13} className="trace-chevron" />
                      </summary>
                      <div className="trace-body">
                        {m.thinking.join('\n\n---\n\n')}
                      </div>
                    </details>
                  )}

                  {editedFilesCount > 0 && (
                    <div className="files-changed-row">
                      <span>
                        {editedFilesCount}{' '}
                        {editedFilesCount === 1 ? 'file changed' : 'files changed'}
                      </span>
                      <span className="files-changed-plus">+{editedFilesCount * 18}</span>
                      <span className="files-changed-minus">-{editedFilesCount * 4}</span>
                      <ChevronRight size={13} />
                    </div>
                  )}

                  {m.content ? <AssistantMessageBody content={m.content} /> : null}
                </div>
              );
            })}

            {optimisticPrompts.map(opt => (
              <div key={opt.id} className="msg-row">
                <div className="msg-user-outer msg-user-Outer-optimistic">
                  <div className="msg-user-card">
                    {opt.attachments?.length > 0 && (
                      <div className="msg-media-strip">
                        {opt.attachments.map(att =>
                          att.dataUrl ? (
                            <img
                              key={att.id}
                              src={att.dataUrl}
                              alt={att.name}
                              className="msg-media-thumb"
                            />
                          ) : (
                            <span key={att.id} className="msg-media-badge">
                              <Paperclip size={11} />
                              {att.name}
                            </span>
                          )
                        )}
                      </div>
                    )}
                    {opt.content ? <div>{opt.content}</div> : null}
                  </div>
                </div>
              </div>
            ))}

            {isBusy && (
              <div className="msg-row msg-assistant">
                <AgyLiveActivityIndicator
                  messages={messages}
                  onCancel={handleCancelRun}
                />
              </div>
            )}
          </>
        )}
      </section>

      <footer className="composer-dock">
        {modelMenuOpen && (
          <>
            <div
              className="model-menu-backdrop"
              onClick={() => setModelMenuOpen(false)}
            />
            <div className="model-selector-popover" role="menu" aria-label="Model">
              <div className="model-selector-header">Model</div>
              <div className="model-selector-list">
                {ANTIGRAVITY_MODELS.map(item => {
                  const isCurrentBase = model
                    .toLowerCase()
                    .startsWith(item.base.toLowerCase());
                  return (
                    <div
                      key={item.base}
                      className={`model-selector-row ${isCurrentBase ? 'active' : ''}`}
                    >
                      <button
                        type="button"
                        className="model-row-main"
                        onClick={() =>
                          handleSelectModel(item.base, item.defaultEffort)
                        }
                      >
                        <span className="model-row-name">{item.base}</span>
                        {item.badge && (
                          <span className="model-row-badge">{item.badge}</span>
                        )}
                      </button>
                      {item.efforts.length > 0 && (
                        <div className="model-effort-group">
                          {item.efforts.map(eff => {
                            const isEffActive =
                              isCurrentBase &&
                              model.toLowerCase().endsWith(eff.toLowerCase());
                            return (
                              <button
                                key={eff}
                                type="button"
                                className={`model-effort-btn ${
                                  isEffActive ? 'active' : ''
                                }`}
                                onClick={() => handleSelectModel(item.base, eff)}
                              >
                                {eff}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.csv,.json,.md,.py,.js,.mjs,.ts,.tsx,.html,.css,.zip,.docx,.xlsx,.pptx"
          style={{ display: 'none' }}
          onChange={e => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="composer-border-wrap">
          <div className="composer-card">
            {pendingAttachments.length > 0 && (
              <div className="composer-attachments">
                {pendingAttachments.map(att => (
                  <div key={att.id} className="attachment-chip">
                    {att.dataUrl ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="attachment-thumb"
                      />
                    ) : (
                      <Paperclip size={14} color="#4a4a4a" />
                    )}
                    <span className="attachment-name">{att.name}</span>
                    <button
                      type="button"
                      className="attachment-remove"
                      onClick={() => handleRemoveAttachment(att.id)}
                      aria-label={`Quitar ${att.name}`}
                      title={`Quitar ${att.name}`}
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              rows={1}
              className="composer-textarea"
              placeholder="Ask anything, @ to mention, / for workflows"
              value={inputText}
              onPaste={handlePaste}
              onChange={e => {
                setInputText(e.target.value);
                syncTextareaHeight(e.target);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            <div className="composer-toolbar">
              <div className="composer-tools-left">
                <button
                  type="button"
                  className="composer-plus-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add context (fotos o archivos)"
                  title="Subir fotos o archivos"
                >
                  <Plus size={18} />
                </button>
                <button
                  type="button"
                  className="composer-meta-pill composer-model-btn"
                  onClick={() => setModelMenuOpen(v => !v)}
                  aria-label={`Select model, current: ${model}`}
                  title="Cambiar modelo"
                >
                  <ChevronDown size={12} />
                  <span>{model}</span>
                </button>
                <span className="composer-meta-pill">
                  <ChevronDown size={12} />
                  {preset}
                </span>
              </div>

              {isBusy && !canSend ? (
                <button
                  type="button"
                  className="send-btn stop"
                  onClick={handleCancelRun}
                  aria-label="Cancel"
                  title="Cancel"
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  className="send-btn"
                  disabled={!canSend}
                  onClick={() => handleSend()}
                  aria-label="Send message"
                  title="Send message"
                >
                  <ArrowUp size={16} strokeWidth={2.4} />
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>

      <dialog
        ref={sidebarDialogRef}
        className="sidebar-drawer"
        closedby="any"
        onClick={e => {
          if (e.target === sidebarDialogRef.current) {
            sidebarDialogRef.current.close();
          }
        }}
      >
        <div className="sidebar-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AgyLogo size={20} color="#101010" />
            <span className="sidebar-brand">Antigravity</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="icon-btn"
              onClick={() => handleNewConversation(null)}
              aria-label="New Conversation"
              title="New Conversation"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        <div className="sidebar-section-label">Projects</div>

        <div className="sidebar-scroll">
          {projects.map(proj => (
            <div key={proj.name} className="project-block">
              <div className="project-header-row">
                <button
                  type="button"
                  className="project-toggle-btn"
                  onClick={() => handleToggleProject(proj.name)}
                >
                  <AgyFolderIcon size={16} />
                  <span>{proj.name}</span>
                </button>
                <button
                  type="button"
                  className="project-new-btn"
                  onClick={() => handleNewConversation(proj.name)}
                  aria-label={`New Conversation in ${proj.name}`}
                  title={`New Conversation in ${proj.name}`}
                >
                  <Plus size={15} />
                </button>
              </div>

              {proj.expanded &&
                (proj.conversations || []).map(c => {
                  const isSel = c.id === (optimisticConvId || selectedConvId);
                  const rowRunning = Boolean(c.isRunning || (isSel && isBusy));
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`session-row ${isSel ? 'active' : ''}`}
                      onClick={() => handleSelectConversation(c.id)}
                    >
                      <span className="session-title">{c.title}</span>
                      {rowRunning ? (
                        <AgySpinnerIcon size={15} />
                      ) : c.timeAgo ? (
                        <span className="session-time">{c.timeAgo}</span>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          ))}

          {ungroupedConversations.length > 0 && (
            <div className="project-block" style={{ marginTop: 8 }}>
              <div className="sidebar-section-label">Recent Sessions</div>
              {ungroupedConversations.map(c => {
                const isSel = c.id === (optimisticConvId || selectedConvId);
                const rowRunning = Boolean(c.isRunning || (isSel && isBusy));
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`session-row ${isSel ? 'active' : ''}`}
                    style={{ paddingLeft: 12 }}
                    onClick={() => handleSelectConversation(c.id)}
                  >
                    <span className="session-title">{c.title}</span>
                    {rowRunning ? (
                      <AgySpinnerIcon size={15} />
                    ) : c.timeAgo ? (
                      <span className="session-time">{c.timeAgo}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </dialog>
    </main>
  );
}
