import type { ReactNode } from 'react'
import { useEffect } from 'react'

// ============== SPINNER ==============
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
    />
  )
}

// ============== STATUS BADGE ==============
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'виконано': 'done',
    'відмовлено': 'rejected',
    'pending': 'pending',
    'в очікуванні': 'pending',
  }
  const cls = map[status] || 'pending'
  const labels: Record<string, string> = {
    'виконано': '✓ Виконано',
    'відмовлено': '✕ Відмовлено',
    'pending': '◌ В очікуванні',
    'в очікуванні': '◌ В очікуванні',
  }
  return <span className={`badge badge-${cls}`}>{labels[status] || status}</span>
}

// ============== MODAL ==============
interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ============== LOADING SCREEN ==============
export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <Spinner />
      <span className="flicker">Завантаження...</span>
    </div>
  )
}

// ============== EMPTY STATE ==============
export function EmptyState({ icon, title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || '◫'}</div>
      <div className="empty-title">{title}</div>
      {subtitle && <div className="empty-sub">{subtitle}</div>}
    </div>
  )
}

// ============== DATE FORMAT ==============
export function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}