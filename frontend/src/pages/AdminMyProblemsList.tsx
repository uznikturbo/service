import { useEffect, useState, useMemo } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { StatusBadge, LoadingScreen, EmptyState, fmtDate } from '../components/ui'
import type { Problem, User } from '../types'

interface AdminMyProblemsProps {
  user: User
  onSelect: (problem: Problem) => void
}

export function AdminMyProblems({ user, onSelect }: AdminMyProblemsProps) {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const data = await problemsApi.list()
      const myData = data.filter(p => p.admin_id === user.id)
      setProblems(myData)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const sorted = useMemo(() => {
    return [...problems].sort((a, b) => 
      new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
    )
  }, [problems])

  if (loading) return <LoadingScreen />

  return (
    <div className="animate-fadeUp">
      <div className="card">
        <div className="card-header">
          <div className="card-title">Мої активні заявки</div>
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            title="У вас немає активних заявок"
            subtitle="Тут з'являться тікети, які ви приймете в роботу."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#ID</th>
                  <th>Назва</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(p)}>
                    <td className="td-mono" style={{ color: 'var(--accent)' }}>
                      #{String(p.id).padStart(4, '0')}
                    </td>
                    <td className="td-primary">{p.title}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="td-mono" style={{ fontSize: 11 }}>{fmtDate(p.date_created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}