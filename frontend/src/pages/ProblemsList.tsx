import { useEffect, useState, useMemo, useRef } from 'react'
import { problemsApi } from '../api'
import { useToast } from '../context/ToastContext'
import { StatusBadge, LoadingScreen, EmptyState, fmtDate } from '../components/ui'
import { CreateProblemModal } from '../components/CreateProblemModal'
import type { Problem, User } from '../types'

interface ProblemsListProps {
  user: User
  onSelect: (problem: Problem) => void
}

type FilterType = 'all' | 'pending' | 'inWork' | 'done' | 'rejected'

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',      label: 'Всі'       },
  { key: 'pending',  label: 'Нові'      },
  { key: 'inWork',   label: 'В роботі'  },
  { key: 'done',     label: 'Виконано'  },
  { key: 'rejected', label: 'Відмовлено'},
]

export function ProblemsList({ user, onSelect }: ProblemsListProps) {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')

  // refs for sliding indicator
  const barRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Map<FilterType, HTMLButtonElement>>(new Map())
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  const toast = useToast()

  // Update indicator position whenever filter or layout changes
  useEffect(() => {
    const bar = barRef.current
    const btn = btnRefs.current.get(statusFilter)
    if (!bar || !btn) return

    const barRect = bar.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()

    setIndicatorStyle({
      left: btnRect.left - barRect.left - 4, // 4 = bar padding
      width: btnRect.width,
    })
  }, [statusFilter])

  // Also recalc on window resize
  useEffect(() => {
    const recalc = () => {
      const bar = barRef.current
      const btn = btnRefs.current.get(statusFilter)
      if (!bar || !btn) return
      const barRect = bar.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      setIndicatorStyle({
        left: btnRect.left - barRect.left - 4,
        width: btnRect.width,
      })
    }
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [statusFilter])

  const sortedProblems = useMemo(() => {
    return [...problems].sort((a, b) => {
      const getPriority = (status: string) => {
        const s = status.trim().toLowerCase()
        if (s === 'в обробці' || s === 'новий') return 0
        if (s === 'в роботі') return 1
        return 2
      }
      const diff = getPriority(a.status) - getPriority(b.status)
      if (diff !== 0) return diff
      return new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
    })
  }, [problems])

  const displayedProblems = useMemo(() => {
    if (statusFilter === 'all') return sortedProblems
    return sortedProblems.filter(p => {
      const s = p.status.trim().toLowerCase()
      if (statusFilter === 'pending')  return s === 'в обробці' || s === 'новий'
      if (statusFilter === 'inWork')   return s === 'в роботі'
      if (statusFilter === 'done')     return s === 'виконано'
      if (statusFilter === 'rejected') return s === 'відмовлено'
      return true
    })
  }, [sortedProblems, statusFilter])

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

  // Counts (always from full list)
  const counts: Record<FilterType, number> = useMemo(() => ({
    all:      problems.length,
    pending:  problems.filter(p => { const s = p.status.trim().toLowerCase(); return s === 'в обробці' || s === 'новий' }).length,
    inWork:   problems.filter(p => p.status.trim().toLowerCase() === 'в роботі').length,
    done:     problems.filter(p => p.status.trim().toLowerCase() === 'виконано').length,
    rejected: problems.filter(p => p.status.trim().toLowerCase() === 'відмовлено').length,
  }), [problems])

  return (
    <div className="animate-fadeUp">

      {/* ── Animated filter bar ── */}
      <div
        className="filter-bar"
        ref={barRef}
        style={{ position: 'relative' }}
      >
        {/* Sliding highlight */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: indicatorStyle.left,
            width: indicatorStyle.width,
            background: 'var(--accent)',
            borderRadius: 2,
            transition: 'left 0.35s cubic-bezier(0.34,1.56,0.64,1), width 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            data-filter={key}
            className={`filter-btn${statusFilter === key ? ' active' : ''}`}
            ref={el => { if (el) btnRefs.current.set(key, el) }}
            onClick={() => setStatusFilter(key)}
          >
            {key !== 'all' && <span className="filter-dot" />}
            {label}
            <span className="filter-btn-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {/* ── Table card ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            Заявки{statusFilter !== 'all' && (
              <span style={{ fontSize: 11, opacity: 0.45, fontWeight: 400, marginLeft: 6 }}>
                / {FILTERS.find(f => f.key === statusFilter)?.label}
              </span>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            + Нова заявка
          </button>
        </div>

        {loading ? (
          <LoadingScreen />
        ) : displayedProblems.length === 0 ? (
          <EmptyState
            title="Заявок немає"
            subtitle={
              statusFilter !== 'all'
                ? 'Немає заявок з таким статусом'
                : 'Натисніть "+ Нова заявка" щоб подати першу заявку до служби підтримки'
            }
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
                    {user.is_admin && <th>Користувач</th>}
                    <th>Дата</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProblems.map(p => (
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

            {/* Mobile cards */}
            <div className="mobile-problem-list">
              {displayedProblems.map(p => (
                <div
                  key={p.id}
                  className="mobile-problem-card"
                  onClick={() => onSelect(p)}
                >
                  <div className="mobile-problem-card-row">
                    <span className="mobile-problem-title">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mobile-problem-card-row">
                    <div className="mobile-problem-meta">
                      <span style={{ color: 'var(--accent)', opacity: 0.7 }}>
                        #{String(p.id).padStart(4, '0')}
                      </span>
                      {user.is_admin && <span>uid:{p.user_id}</span>}
                      <span>{fmtDate(p.date_created)}</span>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={e => handleDelete(p.id, e)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
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