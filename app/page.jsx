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
  PanelLeft
} from 'lucide-react';

const TOKEN_STORAGE_KEY = 'agy_pocket_token_v1';
const LAST_CONV_STORAGE_KEY = 'agy_pocket_last_conv_v1';

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

function renderInlineCode(text) {
  const segments = String(text || '').split(/(`[^`]+`)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length >= 2) {
      return (
        <code key={i} className="inline-code">
          {seg.slice(1, -1)}
        </code>
      );
    }
    return seg;
  });
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
        return <p key={idx}>{renderInlineCode(b.text)}</p>;
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

export default function AgyPocketPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [connected, setConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [model, setModel] = useState('Gemini');
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

  const chatScrollRef = useRef(null);
  const sidebarDialogRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const latestReqIdRef = useRef(0);

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

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const savedConv = localStorage.getItem(LAST_CONV_STORAGE_KEY) || '';
    if (savedConv && savedConv !== '__new__') {
      setSelectedConvId(savedConv);
      setOptimisticConvId(savedConv);
    }

    fetch('/api/auth', { headers: getAuthHeaders() })
      .then(async res => {
        if (res.ok) {
          const data = await res.json();
          if (data.token) localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
          setAuthenticated(true);
        } else {
          setAuthenticated(false);
        }
      })
      .catch(() => {
        if (localStorage.getItem(TOKEN_STORAGE_KEY)) {
          setAuthenticated(true);
        }
      })
      .finally(() => setAuthChecked(true));
  }, [getAuthHeaders]);

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
  }, [getAuthHeaders]);

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
    [selectedConvId, getAuthHeaders]
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

  const handleSelectConversation = async convId => {
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
  };

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
          <p>Sesión persistente (90 días) conectada en vivo a tu PC.</p>
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
          <span
            className={`status-dot ${
              isBusy ? 'busy' : connected ? 'online' : ''
            }`}
          />
        </button>

        <div className="header-actions">
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

      {(isBusy || sendError) && (
        <div className="status-banner">
          <div className="status-banner-copy">
            <strong>
              {sendError ? 'Aviso' : 'Working in Antigravity...'}
            </strong>
            <span>
              {sendError || `${model} • ${preset}`}
            </span>
          </div>
          {isBusy && (
            <button
              type="button"
              className="pill-btn"
              onClick={handleCancelRun}
              aria-label="Cancel"
              title="Cancel"
            >
              Cancel
            </button>
          )}
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
        ) : messages.length === 0 && optimisticPrompts.length === 0 ? (
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

              return (
                <div
                  key={m.id}
                  className={`msg-row msg-assistant ${isDeferred ? 'deferred' : ''}`}
                >
                  {m.thinking?.length > 0 && (
                    <details className="trace-details">
                      <summary className="trace-summary">
                        <ChevronRight size={13} />
                        <span>
                          Worked ({m.thinking.length}{' '}
                          {m.thinking.length === 1 ? 'step' : 'steps'})
                        </span>
                      </summary>
                      <div className="trace-body">
                        {m.thinking.join('\n\n---\n\n')}
                      </div>
                    </details>
                  )}

                  {m.toolCalls?.length > 0 && (
                    <div className="tool-pills">
                      {m.toolCalls.slice(-8).map((tc, tIdx) => (
                        <div key={tIdx} className="tool-pill">
                          <strong>{tc.name}</strong>
                          <span>{tc.summary}</span>
                        </div>
                      ))}
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
          </>
        )}
      </section>

      <footer className="composer-dock">
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
                <span className="composer-meta-pill">
                  <ChevronDown size={12} />
                  {model}
                </span>
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
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`session-row ${isSel ? 'active' : ''}`}
                      onClick={() => handleSelectConversation(c.id)}
                    >
                      <span className="session-title">{c.title}</span>
                      {c.timeAgo ? (
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
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`session-row ${isSel ? 'active' : ''}`}
                    style={{ paddingLeft: 12 }}
                    onClick={() => handleSelectConversation(c.id)}
                  >
                    <span className="session-title">{c.title}</span>
                    {c.timeAgo ? (
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
