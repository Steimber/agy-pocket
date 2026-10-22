'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  Plus,
  ArrowUp,
  Square,
  Sparkles,
  Terminal,
  RefreshCw,
  LogOut,
  Check
} from 'lucide-react';

const TOKEN_STORAGE_KEY = 'agy_pocket_token_v1';
const LAST_CONV_STORAGE_KEY = 'agy_pocket_last_conv_v1';

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

export default function AgyPocketPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [connected, setConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [model, setModel] = useState('Gemini');
  const [preset, setPreset] = useState('Turbo');
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState('');
  const [optimisticConvId, setOptimisticConvId] = useState('');

  const [messages, setMessages] = useState([]);
  const [optimisticPrompts, setOptimisticPrompts] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sendError, setSendError] = useState('');

  const chatScrollRef = useRef(null);
  const sheetDialogRef = useRef(null);
  const textareaRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const latestReqIdRef = useRef(0);

  const getAuthHeaders = useCallback(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
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
        // Offline resilience: if token exists locally, stay in the shell until connection returns
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
          const recentUserTexts = new Set(
            serverMsgs
              .filter(m => m.role === 'user')
              .slice(-8)
              .map(m => m.content.trim())
          );
          return prev.filter(
            p => !recentUserTexts.has(p.content.trim()) && Date.now() - p.ts < 25000
          );
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

  const handleSend = async overrideText => {
    const text = String(overrideText ?? inputText).trim();
    if (!text) return;

    setSendError('');
    const tempId = `opt-${Date.now()}`;
    stickToBottomRef.current = true;

    // 0ms optimistic insert and input clear
    setOptimisticPrompts(prev => [...prev, { id: tempId, content: text, ts: Date.now() }]);
    if (overrideText === undefined) {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
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
          text
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSendError(data.error || 'No se pudo enviar a Antigravity');
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
    // 0ms optimistic visual selection
    setOptimisticConvId(convId);
    setSelectedConvId(convId);
    if (convId && convId !== '__new__') {
      localStorage.setItem(LAST_CONV_STORAGE_KEY, convId);
    }
    sheetDialogRef.current?.close();
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

  const handleNewConversation = async () => {
    sheetDialogRef.current?.close();
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
        body: JSON.stringify({ action: 'new_conversation' })
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
      return { id: '__new__', title: 'Nueva conversación' };
    }
    return conversations.find(c => c.id === id) || conversations[0] || null;
  }, [conversations, optimisticConvId, selectedConvId]);

  if (!authChecked) {
    return <main className="app-shell" />;
  }

  if (!authenticated) {
    return (
      <main className="app-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Agy Pocket</h1>
          <p>Sesión persistente (90 días) conectada directo a tu Antigravity en PC.</p>
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
            <p style={{ color: '#ef6461', marginBottom: 10 }}>{loginError}</p>
          ) : null}
          <button type="submit" className="pin-submit">
            Entrar sin volver a pedir login
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-header">
        <button
          type="button"
          className="conv-selector-btn"
          onPointerDown={fetchConversations}
          onClick={() => {
            fetchConversations();
            sheetDialogRef.current?.showModal();
          }}
          aria-label="Cambiar conversación"
          title="Cambiar conversación"
        >
          <span
            className={`status-dot ${
              isBusy ? 'busy' : connected ? 'online' : ''
            }`}
          />
          <div className="conv-selector-copy">
            <div className="conv-selector-title">
              {activeConvObj?.title || 'Antigravity Chat'}
            </div>
            <div className="conv-selector-sub">
              {connected ? `${model} • ${preset}` : 'Reconectando con tu PC...'}
            </div>
          </div>
          <ChevronDown size={16} />
        </button>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn accent"
            onClick={handleNewConversation}
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <Plus size={17} />
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
              {sendError ? 'Aviso de envío' : 'Antigravity está trabajando en tu PC...'}
            </strong>
            <span>
              {sendError || `Modelo activo: ${model} (${preset})`}
            </span>
          </div>
          {isBusy && (
            <button
              type="button"
              className="pill-btn"
              onClick={handleCancelRun}
              aria-label="Detener ejecución"
              title="Detener ejecución"
            >
              Detener
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
            <h1>¿En qué seguimos hoy?</h1>
            <p>
              Todo lo que escribas acá se ejecuta en vivo en el Antigravity abierto en tu PC.
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
                    <div className="msg-user">{m.content}</div>
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
                        <Sparkles size={13} color="#d97757" />
                        <span>
                          Razonamiento ({m.thinking.length}{' '}
                          {m.thinking.length === 1 ? 'paso' : 'pasos'})
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
                          <Terminal size={11} />
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
                <div className="msg-user optimistic">{opt.content}</div>
              </div>
            ))}
          </>
        )}
      </section>

      <footer className="composer-dock">
        <div className="composer-card">
          <textarea
            ref={textareaRef}
            rows={1}
            className="composer-textarea"
            placeholder="Escribile a tu Antigravity..."
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(135, e.target.scrollHeight)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {isBusy && !inputText.trim() ? (
            <button
              type="button"
              className="send-btn stop"
              onClick={handleCancelRun}
              aria-label="Cancelar ejecución"
              title="Cancelar ejecución"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              className="send-btn"
              disabled={!inputText.trim()}
              onClick={() => handleSend()}
              aria-label="Enviar mensaje"
              title="Enviar mensaje"
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </footer>

      <dialog
        ref={sheetDialogRef}
        className="sheet-dialog"
        closedby="any"
        onClick={e => {
          if (e.target === sheetDialogRef.current) {
            sheetDialogRef.current.close();
          }
        }}
      >
        <div className="sheet-header">
          <h2>Conversaciones en tu PC</h2>
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
        <div className="conv-list">
          {conversations.map(c => {
            const isSel = c.id === (optimisticConvId || selectedConvId);
            return (
              <button
                key={c.id}
                type="button"
                className={`conv-item ${isSel ? 'active' : ''}`}
                onClick={() => handleSelectConversation(c.id)}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="conv-item-title">{c.title}</div>
                  <div className="conv-item-meta">
                    {c.isActive ? 'Abierta en PC • ' : ''}
                    {c.id.slice(0, 8)}
                  </div>
                </div>
                {isSel ? <Check size={16} color="#d97757" /> : null}
              </button>
            );
          })}
        </div>
      </dialog>
    </main>
  );
}
