import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { StatusBadge, LoadingScreen, EmptyState, fmtDate } from '../components/ui'
import type { Problem, User } from '../types'

interface AdminMyProblemsProps {
  user: User
  onSelect: (problem: Problem) => void
}

type FilterType = 'all' | 'inWork' | 'done' | 'rejected'

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',      label: 'Всі'        },
  { key: 'inWork',   label: 'В роботі'   },
  { key: 'done',     label: 'Виконано'   },
  { key: 'rejected', label: 'Відмовлено' },
]

export function AdminMyProblems({ user, onSelect }: AdminMyProblemsProps) {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')

  const barRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Map<FilterType, HTMLButtonElement>>(new Map())
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  const toast = useToast()

  const recalcIndicator = useCallback(() => {
    const btn = btnRefs.current.get(statusFilter)
    if (!btn) return
    setIndicatorStyle({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [statusFilter])

  useEffect(() => {
    const raf = requestAnimationFrame(() => recalcIndicator())
    return () => cancelAnimationFrame(raf)
  }, [recalcIndicator])

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() => recalcIndicator())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [recalcIndicator])

  const load = useCallback(async () => {
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
  }, [user.id, toast])

  useEffect(() => { load() }, [load])

  const sorted = useMemo(() => {
    return [...problems].sort((a, b) =>
      new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
    )
  }, [problems])

  const counts: Record<FilterType, number> = useMemo(() => ({
    all:      problems.length,
    inWork:   problems.filter(p => p.status.trim().toLowerCase() === 'в роботі').length,
    done:     problems.filter(p => p.status.trim().toLowerCase() === 'виконано').length,
    rejected: problems.filter(p => p.status.trim().toLowerCase() === 'відмовлено').length,
  }), [problems])

  const displayed = useMemo(() => {
    if (statusFilter === 'all') return sorted
    return sorted.filter(p => {
      const s = p.status.trim().toLowerCase()
      if (statusFilter === 'inWork')   return s === 'в роботі'
      if (statusFilter === 'done')     return s === 'виконано'
      if (statusFilter === 'rejected') return s === 'відмовлено'
      return true
    })
  }, [sorted, statusFilter])

  return (
    <div className="animate-fadeUp">
      <div className="filter-bar" ref={barRef} style={{ position: 'relative' }}>
        <span className="filter-bar-indicator" style={{ left: indicatorStyle.left, width: indicatorStyle.width }} />
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            className={`filter-btn${statusFilter === key ? ' active' : ''}`}
            ref={el => { if (el) btnRefs.current.set(key, el) }}
            onClick={() => setStatusFilter(key)}
          >
            {key !== 'all' && <span className="filter-dot" />}
            {label} <span className="filter-btn-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Мої активні заявки</div>
        </div>

        {loading ? (
          <LoadingScreen />
        ) : displayed.length === 0 ? (

          <EmptyState
            title="У вас немає активних заявок"
            subtitle="Тут з'являться тікети, які ви приймете в роботу."
          />
        ) : (
          <>
            {/* Desktop table */}
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
                  {displayed.map(p => (
                    <tr key={p.id} className="animate-fadeIn" style={{ cursor: 'pointer' }} onClick={() => onSelect(p)}>
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

            {/* Mobile cards */}
            <div className="mobile-problem-list">
              {displayed.map(p => (
                <div key={p.id} className="mobile-problem-card animate-fadeIn" onClick={() => onSelect(p)}>
                  <div className="mobile-problem-card-row">
                    <span className="mobile-problem-title">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mobile-problem-meta">
                    <span style={{ color: 'var(--accent)' }}>#{String(p.id).padStart(4, '0')}</span>
                    <span>·</span>
                    <span>{fmtDate(p.date_created)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}