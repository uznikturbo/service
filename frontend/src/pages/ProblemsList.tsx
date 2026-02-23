import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
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

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 5

export function ProblemsList({ user, onSelect }: ProblemsListProps) {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<FilterType>('all')

  const barRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Map<FilterType, HTMLButtonElement>>(new Map())
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

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

  useEffect(() => {
    if(!user?.id) return;

    let socket: WebSocket | null = null
    let reconnectAttempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isMounted = true

    function getToken(): string | null {
      return localStorage.getItem('token')
    }

    function connect() {
      if (!isMounted) return

      const token = getToken()
      if (!token) {
        console.warn('WS: no auth token, skipping connection')
        return
      }

      const wsUrl = `ws://localhost:8000/ws/problems/notifications?token=${encodeURIComponent(token)}`

      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        reconnectAttempts = 0
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'new_problem') {
            const newProblem: Problem = payload.data
            const { id: userId, is_admin } = userRef.current
            if (is_admin || newProblem.user_id === userId) {
              setProblems((prev) => {
                if (prev.find(p => p.id === newProblem.id)) return prev
                return [newProblem, ...prev]
              })
              toastRef.current('З\'явилася нова заявка!', 'info')
            }
          }

          if (payload.type === "update_problem") {
            const updatedProblem: Problem  = payload.data;
            const { id: userId, is_admin } = userRef.current;

            if  (is_admin || updatedProblem.user_id === userId) {
                setProblems((prev) => 
                prev.map((p) => (p.id === updatedProblem.id ?   updatedProblem : p))
              );

              toastRef.current(`Статус заявки #${updatedProblem.id} оновлено: ${updatedProblem.status}`, 'info')
            }
          }
        } catch (err) {
          console.error('WS parsing error:', err)
        }
      }

      socket.onerror = (err) => {
        console.error('WS error:', err)
      }

      socket.onclose = (event) => {
        if (!isMounted) return
        if (event.code === 1008) {
          console.warn('WS closed by server (policy violation), not reconnecting')
          return
        }
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.warn('WS max reconnect attempts reached')
          return
        }
        reconnectAttempts++
        const delay = RECONNECT_DELAY_MS * reconnectAttempts
        console.info(`WS disconnected, reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      isMounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
    }
  }, [user?.id]);

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await problemsApi.list()
      setProblems(data)
    } catch (e: any) {
      toast(e.message || 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Видалити заявку?')) return
    try {
      await problemsApi.delete(id)
      setProblems(prev => prev.filter(p => p.id !== id))
      toast('Заявку видалено', 'success')
    } catch (e: any) {
      toast(e.message || 'Помилка', 'error')
    }
  }

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

  const counts: Record<FilterType, number> = useMemo(() => ({
    all:      problems.length,
    pending:  problems.filter(p => ['в обробці', 'новий'].includes(p.status.trim().toLowerCase())).length,
    inWork:   problems.filter(p => p.status.trim().toLowerCase() === 'в роботі').length,
    done:     problems.filter(p => p.status.trim().toLowerCase() === 'виконано').length,
    rejected: problems.filter(p => p.status.trim().toLowerCase() === 'відмовлено').length,
  }), [problems])

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
          <div className="card-title">Заявки</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Нова заявка</button>
        </div>

        {loading ? <LoadingScreen /> : displayedProblems.length === 0 ? (
          <EmptyState title="Заявок немає" subtitle="Список порожній" />
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedProblems.map(p => (
                    <tr key={p.id} className="animate-fadeIn" style={{ cursor: 'pointer' }} onClick={() => onSelect(p)}>
                      <td className="td-mono">#{String(p.id).padStart(4, '0')}</td>
                      <td className="td-primary">{p.title}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="td-mono" style={{ fontSize: 10 }}>{fmtDate(p.date_created)}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={e => handleDelete(p.id, e)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mobile-problem-list">
              {displayedProblems.map(p => (
                <div key={p.id} className="mobile-problem-card animate-fadeIn" onClick={() => onSelect(p)}>
                  <div className="mobile-problem-card-row">
                    <span className="mobile-problem-title">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mobile-problem-meta">
                    <span style={{ color: 'var(--accent)' }}>#{String(p.id).padStart(4, '0')}</span>
                    <span>·</span>
                    <span>{fmtDate(p.date_created)}</span>
                    <span style={{ marginLeft: 'auto' }}>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ padding: '3px 8px', fontSize: 9 }}
                        onClick={e => handleDelete(p.id, e)}
                      >✕</button>
                    </span>
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
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  )
}