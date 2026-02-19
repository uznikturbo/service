import { useEffect, useState } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { StatusBadge, LoadingScreen, EmptyState, fmtDate } from '../components/ui'
import { CreateProblemModal } from '../components/CreateProblemModal'
import type { Problem, User } from '../types'

interface ProblemsListProps {
  user: User
  onSelect: (problem: Problem) => void
}

export function ProblemsList({ user, onSelect }: ProblemsListProps) {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const data = await problemsApi.list()
      setProblems(data)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Видалити заявку?')) return
    try {
      await problemsApi.delete(id)
      toast('Заявку видалено', 'success')
      load()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    }
  }

  const total = problems.length
  const done = problems.filter(p => p.status === 'виконано').length
  const rejected = problems.filter(p => p.status === 'відмовлено').length
  const pending = total - done - rejected

  return (
    <div className="animate-fadeUp">
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-cell highlight">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Всього заявок</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{pending}</div>
          <div className="stat-label">В обробці</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{done}</div>
          <div className="stat-label">Виконано</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value" style={{ color: 'var(--red)' }}>{rejected}</div>
          <div className="stat-label">Відмовлено</div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Заявки</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + Нова заявка
          </button>
        </div>

        {loading ? (
          <LoadingScreen />
        ) : problems.length === 0 ? (
          <EmptyState
            title="Заявок немає"
            subtitle='Натисніть "+ Нова заявка" щоб подати першу заявку до служби підтримки'
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#ID</th>
                  <th>Назва</th>
                  <th>Статус</th>
                  {user.is_admin && <th>Користувач</th>}
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {problems.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(p)}>
                    <td className="td-mono" style={{ color: 'var(--accent)', opacity: 0.7 }}>
                      #{String(p.id).padStart(4, '0')}
                    </td>
                    <td className="td-primary">{p.title}</td>
                    <td><StatusBadge status={p.status} /></td>
                    {user.is_admin && (
                      <td className="td-mono" style={{ fontSize: 10 }}>uid:{p.user_id}</td>
                    )}
                    <td className="td-mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
                      {fmtDate(p.date_created)}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={e => handleDelete(p.id, e)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProblemModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
