import { useState, useEffect, useRef } from 'react'
import { problemsApi, API_BASE } from '../api'
import { useToast } from '../context/ToastContext'
import { StatusBadge, fmtDate } from '../components/ui'
import { ServiceRecordModal } from '../components/AdminModals'
import type { Problem, User } from '../types'

interface ProblemDetailProps {
  problem: Problem
  user: User
  onBack: () => void
  onUpdate?: (updated: Problem) => void
}

export function ProblemDetail({ problem: initialProblem, user, onBack, onUpdate }: ProblemDetailProps) {
  const [problem, setProblem] = useState<Problem>(initialProblem)
  const [loading, setLoading] = useState(false)
  const [showRecord, setShowRecord] = useState(false)
  const toast = useToast()

  const [messages, setMessages] = useState<any[]>(initialProblem.messages || [])
  const [newMessage, setNewMessage] = useState('')
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpdate = (data: Problem) => {
    setProblem(data)
    if (onUpdate) onUpdate(data)
  }

  const refresh = async () => {
    try {
      const data = await problemsApi.get(problem.id)
      handleUpdate(data)
      if (data.messages) setMessages(data.messages)
    } catch (e) {
      console.error("Не вдалося оновити дані проблеми", e)
    }
  }

  useEffect(() => {
    refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.id])

  useEffect(() => {
    const isCreator = user.id === problem.user_id;
    const isAssignedAdmin = user.is_admin && problem.admin_id === user.id;

    if ((!isCreator && !isAssignedAdmin) || !problem.admin_id) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `ws://localhost:8000/ws/problems/${problem.id}/chat?token=${token}`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
    };

    socket.onerror = () => {
      toast('Помилка з\'єднання з чатом', 'error');
    };

    setWs(socket);

    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [problem.id, problem.admin_id, problem.user_id, user.id, user.is_admin, toast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || ws.readyState !== WebSocket.OPEN || !newMessage.trim()) return;
    ws.send(JSON.stringify({ message: newMessage }));
    setNewMessage('');
  };

  const assign = async () => {
    setLoading(true)
    try {
      const data = await problemsApi.assign(problem.id)
      handleUpdate(data)
      toast('Заявку взято в роботу', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  const changeStatus = async (status: string) => {
    setLoading(true)
    try {
      const data = await problemsApi.updateStatus(problem.id, status)
      handleUpdate(data)
      toast(`Статус змінено на "${status}"`, 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  const isClosed = ['виконано', 'відмовлено'].includes(problem.status)
  const canSeeChat = problem.admin_id && (user.id === problem.user_id || (user.is_admin && problem.admin_id === user.id));

  return (
    <div className="animate-fadeUp">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Назад</button>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>Заявка</span>
        <span style={{ color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
          #{String(problem.id).padStart(4, '0')}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <StatusBadge status={problem.status} />
          {problem.admin_id && (
            <span className="badge badge-admin">◆ Адмін #{problem.admin_id}</span>
          )}
        </div>
      </div>

      <div className="detail-grid">
        {/* Main content */}
        <div>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <div className="card-title">Деталі заявки</div>
            </div>
            <div className="card-body">
              <div className="detail-field">
                <div className="detail-field-label">Опис</div>
                <div className="detail-field-value" style={{ lineHeight: 1.6, fontSize: 13, color: 'var(--text2)' }}>
                  {problem.description}
                </div>
              </div>
              {problem.image_url && (
                <div className="detail-field">
                  <div className="detail-field-label">Зображення</div>
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', backgroundColor: 'var(--bg2)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <img
                      src={problem.image_url.startsWith('http') ? problem.image_url : `${API_BASE}/${problem.image_url.replace(/^\//, '')}`}
                      alt="Додаток до заявки"
                      style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '4px' }}
                    />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
                <div className="detail-field" style={{ margin: 0 }}>
                  <div className="detail-field-label">Дата подачі</div>
                  <div className="detail-field-value td-mono" style={{ fontSize: 12 }}>{fmtDate(problem.date_created)}</div>
                </div>
                <div className="detail-field" style={{ margin: 0 }}>
                  <div className="detail-field-label">Автор</div>
                  <div className="detail-field-value td-mono" style={{ fontSize: 12 }}>uid:{problem.user_id}</div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/*                    КРАСИВИЙ ЧАТ                        */}
          {/* ═══════════════════════════════════════════════════════ */}
          {canSeeChat ? (
            <div style={{
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: 'var(--bg1)',
              boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
            }}>

              {/* Chat Header */}
              <div style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg1)), color-mix(in srgb, var(--accent) 4%, var(--bg1)))',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                {/* Animated status dot */}
                <div style={{ position: 'relative', width: 10, height: 10 }}>
                  <div style={{
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background: ws && ws.readyState === WebSocket.OPEN ? '#22c55e' : 'var(--text3)',
                    boxShadow: ws && ws.readyState === WebSocket.OPEN ? '0 0 0 0 rgba(34,197,94,0.4)' : 'none',
                    animation: ws && ws.readyState === WebSocket.OPEN ? 'chatPulse 2s ease-out infinite' : 'none',
                  }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', letterSpacing: 0.3 }}>
                  Чат по заявці
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: 'var(--text3)',
                  background: 'var(--bg2)',
                  padding: '2px 8px',
                  borderRadius: 20,
                  border: '1px solid var(--border)',
                }}>
                  {messages.length} повідомлень
                </span>
              </div>

              {/* Messages area */}
              <div style={{
                height: 340,
                overflowY: 'auto',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                background: 'linear-gradient(180deg, var(--bg1) 0%, color-mix(in srgb, var(--bg2) 40%, var(--bg1)) 100%)',
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--border) transparent',
              }}>
                {messages.length === 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: 10,
                    color: 'var(--text3)',
                  }}>
                    <div style={{ fontSize: 32, opacity: 0.4 }}>💬</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Повідомлень поки немає</div>
                    <div style={{ fontSize: 11, opacity: 0.5 }}>Напишіть першим!</div>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isMe = msg.user_id === user.id;
                    const prevMsg = messages[idx - 1];
                    const isSameAuthor = prevMsg && prevMsg.user_id === msg.user_id;

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isMe ? 'flex-end' : 'flex-start',
                          marginTop: isSameAuthor ? 2 : 8,
                          animation: 'msgSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                          animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                        }}
                      >
                        {/* Author label — only show if first in a group */}
                        {!isSameAuthor && (
                          <div style={{
                            fontSize: 10,
                            color: 'var(--text3)',
                            marginBottom: 4,
                            paddingLeft: isMe ? 0 : 4,
                            paddingRight: isMe ? 4 : 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <span style={{
                              width: 16, height: 16,
                              borderRadius: '50%',
                              background: isMe
                                ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff))'
                                : 'var(--bg3, var(--bg2))',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 8,
                              color: isMe ? '#fff' : 'var(--text2)',
                              border: '1px solid var(--border)',
                              flexShrink: 0,
                            }}>
                              {msg.is_admin ? '◆' : '●'}
                            </span>
                            {msg.is_admin ? 'Адміністратор' : 'Користувач'}
                          </div>
                        )}

                        {/* Bubble */}
                        <div style={{
                          position: 'relative',
                          padding: '9px 14px',
                          borderRadius: isMe
                            ? (isSameAuthor ? '14px 4px 4px 14px' : '14px 4px 14px 14px')
                            : (isSameAuthor ? '4px 14px 14px 4px' : '4px 14px 14px 14px'),
                          maxWidth: '75%',
                          fontSize: 13,
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                          background: isMe
                            ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 85%, #000))'
                            : 'var(--bg2)',
                          color: isMe ? '#fff' : 'var(--text1)',
                          border: isMe ? 'none' : '1px solid var(--border)',
                          boxShadow: isMe
                            ? '0 2px 12px color-mix(in srgb, var(--accent) 35%, transparent)'
                            : '0 1px 4px rgba(0,0,0,0.08)',
                          transition: 'transform 0.1s ease',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.01)')}
                          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                          {msg.message}
                        </div>

                        {/* Timestamp */}
                        {msg.created_at && (
                          <div style={{
                            fontSize: 9,
                            color: 'var(--text3)',
                            marginTop: 3,
                            paddingLeft: isMe ? 0 : 4,
                            paddingRight: isMe ? 4 : 0,
                            opacity: 0.6,
                          }}>
                            {new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
              {!isClosed ? (
                <div style={{
                  padding: '12px 14px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg1)',
                }}>
                  <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1,
                      position: 'relative',
                      borderRadius: 12,
                      border: `1px solid ${isTyping ? 'var(--accent)' : 'var(--border)'}`,
                      background: 'var(--bg2)',
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                      boxShadow: isTyping ? '0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent)' : 'none',
                    }}>
                      <input
                        ref={inputRef}
                        type="text"
                        style={{
                          width: '100%',
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          padding: '10px 14px',
                          fontSize: 13,
                          color: 'var(--text1)',
                          borderRadius: 12,
                          boxSizing: 'border-box',
                        }}
                        placeholder="Написати повідомлення..."
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onFocus={() => setIsTyping(true)}
                        onBlur={() => setIsTyping(false)}
                        disabled={!ws || ws.readyState !== WebSocket.OPEN}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        border: `1px solid ${newMessage.trim() && ws && ws.readyState === WebSocket.OPEN ? 'transparent' : 'var(--border)'}`,
                        cursor: newMessage.trim() && ws && ws.readyState === WebSocket.OPEN ? 'pointer' : 'not-allowed',
                        background: newMessage.trim() && ws && ws.readyState === WebSocket.OPEN
                          ? 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 80%, #000))'
                          : 'var(--bg2)',
                        color: newMessage.trim() && ws && ws.readyState === WebSocket.OPEN ? '#fff' : 'var(--text3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        flexShrink: 0,
                        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transform: newMessage.trim() ? 'scale(1.05)' : 'scale(1)',
                        boxShadow: newMessage.trim() ? '0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
                      }}
                      onMouseEnter={e => { if (newMessage.trim()) e.currentTarget.style.transform = 'scale(1.12) rotate(-5deg)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = newMessage.trim() ? 'scale(1.05)' : 'scale(1)' }}
                    >
                      ➤
                    </button>
                  </form>
                </div>
              ) : (
                <div style={{
                  padding: '12px 18px',
                  borderTop: '1px solid var(--border)',
                  textAlign: 'center',
                  fontSize: 11,
                  color: 'var(--text3)',
                  background: 'var(--bg1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                  <span style={{ opacity: 0.5 }}>🔒</span>
                  Заявку закрито — чат тільки для читання
                </div>
              )}

              {/* CSS animations via style tag trick */}
              <style>{`
                @keyframes chatPulse {
                  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
                  70% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
                  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
                }
                @keyframes msgSlideIn {
                  from {
                    opacity: 0;
                    transform: translateY(8px) scale(0.97);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                  }
                }
              `}</style>
            </div>
          ) : (
            !problem.admin_id && (
              <div className="card" style={{ borderStyle: 'dashed', opacity: 0.5 }}>
                <div className="card-body" style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 12 }}>
                  ◌ Чат стане доступним після того, як адміністратор прийме заявку
                </div>
              </div>
            )
          )}

          {/* Service record */}
          {problem.service_record && (
            <div className="panel-section" style={{ marginTop: 12 }}>
              <div className="panel-section-title">Сервісний запис</div>
              <div className="panel-section-body">
                <div className="detail-field">
                  <div className="detail-field-label">Виконані роботи</div>
                  <div className="detail-field-value" style={{ fontSize: 13 }}>{problem.service_record.work_done}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-field-label">Гарантія</div>
                  <div className="detail-field-value" style={{ fontSize: 13 }}>{problem.service_record.warranty_info}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  Завершено: {fmtDate(problem.service_record.date_completed)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Actions */}
        <div>
            {user.is_admin && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-header">
              <div className="card-title">Дії адміна</div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!problem.admin_id && user.id !== problem.user_id && (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={assign} disabled={loading}>
                ◆ Прийняти заявку
                </button>
              )}
              {!problem.admin_id && user.id === problem.user_id && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text3)', textAlign: 'center' }}>
                ⚠️ Не можна прийняти власну заявку
                </div>
              )}

                {!isClosed && problem.admin_id === user.id && (
                  <>
                    {problem.admin_id === user.id && !problem.service_record && (
                      <button className="btn btn-ghost" style={{ width: '100%', color: 'var(--green)' }} onClick={() => setShowRecord(true)}>
                        ◫ Сервісний запис
                      </button>
                    )}
                    <button
                      className="btn btn-danger"
                      style={{ width: '100%' }}
                      onClick={() => changeStatus('відмовлено')}
                      disabled={loading}
                    >
                      ✕ Відмовити
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="panel-section">
            <div className="panel-section-title">Інформація</div>
            <div className="panel-section-body">
              {[
                ['Статус', <StatusBadge key="status" status={problem.status} />],
                ['Виконавець', problem.admin_id ? `ID:${problem.admin_id}` : 'Не призначено'],
                ['Створено', fmtDate(problem.date_created)],
              ].map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>{k}</span>
                  <span style={{ color: 'var(--text2)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showRecord && (
        <ServiceRecordModal
          userId={user.id}
          problemId={problem.id}
          onClose={() => setShowRecord(false)}
          onDone={() => { setShowRecord(false); refresh() }}
        />
      )}
    </div>
  )
}