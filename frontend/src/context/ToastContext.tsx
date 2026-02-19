import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Toast, ToastType } from '../types'

type ToastFn = (msg: string, type?: ToastType) => void

const ToastCtx = createContext<ToastFn>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const show = useCallback((msg: string, type: ToastType = 'info') => {
    const id = ++nextId.current
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }, [])

  const icons: Record<ToastType, string> = { success: '✓', error: '✕', info: '◆' }
  const colors: Record<ToastType, string> = {
    success: 'var(--green)',
    error: 'var(--red)',
    info: 'var(--accent)',
  }

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span style={{ color: colors[t.type], fontWeight: 700 }}>{icons[t.type]}</span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
