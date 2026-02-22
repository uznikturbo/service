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
  const chatEndRef = useRef<HTMLDivElement>(null)

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

  // 1. ПІДТЯГУЄМО СВІЖІ ДАНІ ПРИ ВІДКРИТТІ АБО ПІСЛЯ F5
  useEffect(() => {
    refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.id])

  // --- WebSocket Логіка ---
  useEffect(() => {
    const isCreator = user.id === problem.user_id;
    const isAssignedAdmin = user.is_admin && problem.admin_id === user.id;

    if ((!isCreator && !isAssignedAdmin) || !problem.admin_id) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    // Автоматично адаптуємо протокол (ws:// для http, wss:// для https)
    const wsProtocol = API_BASE.startsWith('https') ? 'wss' : 'ws';
    const wsBaseUrl = API_BASE.replace(/^https?/, wsProtocol);
    const wsUrl = `${wsBaseUrl}/ws/problems/${problem.id}/chat?token=${token}`;
    
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

  // Автоскрол до останнього повідомлення
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ws || ws.readyState !== WebSocket.OPEN || !newMessage.trim()) return;

    ws.send(JSON.stringify({ message: newMessage }));
    setNewMessage('');
  };
  // ------------------------

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

  // Перевірка чи може поточний юзер бачити чат
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
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '400px',
                        objectFit: 'contain', 
                        borderRadius: '4px' 
                      }} 
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

          {/* Чат */}
          {canSeeChat ? (
            <div className="panel-section">
              <div className="panel-section-title">Чат по заявці</div>
              <div className="panel-section-body" style={{ display: 'flex', flexDirection: 'column', height: '350px' }}>
                
                {/* Список повідомлень */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, margin: 'auto' }}>
                      Повідомлень поки немає. Напишіть першим!
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isMe = msg.user_id === user.id;
                      return (
                        <div key={idx} style={{
                          alignSelf: isMe ? 'flex-end' : 'flex-start',
                          backgroundColor: isMe ? 'var(--accent)' : 'var(--bg2)',
                          color: isMe ? '#fff' : 'var(--text1)',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          maxWidth: '80%',
                          fontSize: 13
                        }}>
                          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>
                            {msg.is_admin ? 'Адміністратор' : 'Користувач'}
                          </div>
                          {msg.message}
                        </div>
                      )
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Поле вводу */}
                {!isClosed && (
                  <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="input"
                      style={{ flex: 1 }}
                      placeholder="Написати повідомлення..."
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN}>
                      ➤
                    </button>
                  </form>
                )}
                {isClosed && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', padding: 8 }}>
                    Заявку закрито. Чат доступний лише для читання.
                  </div>
                )}
              </div>
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
                
                {!problem.admin_id && (
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={assign} disabled={loading}>
                    ◆ Прийняти заявку
                  </button>
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

          {/* Metadata Sidebar Section */}
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