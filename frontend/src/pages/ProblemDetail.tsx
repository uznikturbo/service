import { useState } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { StatusBadge, fmtDate } from '../components/ui'
import { AdminResponseModal, ServiceRecordModal } from '../components/AdminModals'
import type { Problem, User } from '../types'

interface ProblemDetailProps {
  problem: Problem
  user: User
  onBack: () => void
}

export function ProblemDetail({ problem: initialProblem, user, onBack }: ProblemDetailProps) {
  const [problem, setProblem] = useState<Problem>(initialProblem)
  const [loading, setLoading] = useState(false)
  const [showResponse, setShowResponse] = useState(false)
  const [showRecord, setShowRecord] = useState(false)
  const toast = useToast()

  const refresh = async () => {
    try {
      const data = await problemsApi.get(problem.id)
      setProblem(data)
    } catch {}
  }

  const assign = async () => {
    setLoading(true)
    try {
      const data = await problemsApi.assign(problem.id)
      setProblem(data)
      toast('Заявку призначено вам', 'success')
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
      setProblem(data)
      toast('Статус оновлено', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  const isClosed = ['виконано', 'відмовлено'].includes(problem.status)

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
          {/* Problem details card */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">
              <div className="card-title">Деталі заявки</div>
            </div>
            <div className="card-body">
              <div className="detail-field">
                <div className="detail-field-label">Тема</div>
                <div
                  className="detail-field-value"
                  style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700 }}
                >
                  {problem.title}
                </div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Опис</div>
                <div
                  className="detail-field-value"
                  style={{ lineHeight: 1.6, fontSize: 13, color: 'var(--text2)' }}
                >
                  {problem.description}
                </div>
              </div>
              {problem.image_url && (
                <div className="detail-field">
                  <div className="detail-field-label">Зображення</div>
                  <img
                    src={problem.image_url}
                    alt="attachment"
                    style={{
                      maxWidth: '100%',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      marginTop: 4,
                    }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div className="detail-field" style={{ margin: 0 }}>
                  <div className="detail-field-label">Дата подачі</div>
                  <div className="detail-field-value td-mono" style={{ fontSize: 12 }}>
                    {fmtDate(problem.date_created)}
                  </div>
                </div>
                <div className="detail-field" style={{ margin: 0 }}>
                  <div className="detail-field-label">Автор</div>
                  <div className="detail-field-value td-mono" style={{ fontSize: 12 }}>
                    uid:{problem.user_id}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Admin response */}
          {problem.response ? (
            <div className="panel-section">
              <div className="panel-section-title">Відповідь адміністратора</div>
              <div className="panel-section-body">
                <div className="response-msg">{problem.response.message}</div>
                <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text3)' }}>
                  Адмін #{problem.response.admin_id} · {fmtDate(problem.response.date_responded)}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ borderStyle: 'dashed', opacity: 0.5 }}>
              <div className="card-body" style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 12 }}>
                ◌ Відповідь ще не надана
              </div>
            </div>
          )}

          {/* Service record */}
          {problem.service_record && (
            <div className="panel-section" style={{ marginTop: 12 }}>
              <div className="panel-section-title">Сервісний запис</div>
              <div className="panel-section-body">
                <div className="detail-field">
                  <div className="detail-field-label">Виконані роботи</div>
                  <div className="detail-field-value" style={{ fontSize: 13 }}>
                    {problem.service_record.work_done}
                  </div>
                </div>
                <div className="detail-field">
                  <div className="detail-field-label">Гарантія</div>
                  <div className="detail-field-value" style={{ fontSize: 13 }}>
                    {problem.service_record.warranty_info}
                  </div>
                </div>
                {(problem.service_record.used_parts?.length ?? 0) > 0 && (
                  <div className="detail-field">
                    <div className="detail-field-label">Використані запчастини</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {problem.service_record.used_parts!.map((p, i) => (
                        <span key={i} className="tag">◆ {p}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  Завершено: {fmtDate(problem.service_record.date_completed)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Admin actions */}
          {user.is_admin && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-header">
                <div className="card-title">Дії адміна</div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!problem.admin_id && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={assign}
                    disabled={loading}
                  >
                    ◆ Взяти заявку
                  </button>
                )}
                {!problem.response && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowResponse(true)}
                  >
                    ✎ Відповісти
                  </button>
                )}
                {!isClosed && (
                  <>
                    <button
                      className="btn btn-ghost"
                      style={{ width: '100%', justifyContent: 'center', color: 'var(--green)' }}
                      onClick={() => changeStatus('виконано')}
                      disabled={loading}
                    >
                      ✓ Позначити виконаним
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => changeStatus('відмовлено')}
                      disabled={loading}
                    >
                      ✕ Відмовити
                    </button>
                  </>
                )}
                {!problem.service_record && (
                  <button
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowRecord(true)}
                  >
                    ◫ Додати сервісний запис
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="panel-section">
            <div className="panel-section-title">Метадані</div>
            <div className="panel-section-body">
              {[
                ['ID заявки', `#${String(problem.id).padStart(4, '0')}`],
                ['ID користувача', `uid:${problem.user_id}`],
                ['ID адміна', problem.admin_id ? `uid:${problem.admin_id}` : '—'],
                ['Статус', problem.status],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>{k}</span>
                  <span style={{ color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showResponse && (
        <AdminResponseModal
          problemId={problem.id}
          onClose={() => setShowResponse(false)}
          onDone={() => { setShowResponse(false); refresh() }}
        />
      )}
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
