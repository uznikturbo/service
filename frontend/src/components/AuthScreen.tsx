import { useState } from 'react'
import { apiClient, authApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Spinner } from './ui'
import type { User } from '../types'

interface AuthScreenProps {
  onLogin: (user: User) => void
}

// ─── inline styles (можно вынести в CSS/модуль) ───────────────────────────────
const styles = {
  fieldErrorWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    marginTop: '5px',
    padding: '7px 11px',
    borderRadius: '5px',
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    border: '1px solid rgba(220, 38, 38, 0.35)',
    fontSize: '12px',
    color: '#f87171',
    lineHeight: 1.4,
    animation: 'shake 0.3s ease',
  } as React.CSSProperties,

  generalErrorWrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '16px',
    padding: '11px 14px',
    borderRadius: '6px',
    backgroundColor: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.30)',
    color: '#f87171',
    fontSize: '13px',
    lineHeight: 1.5,
    animation: 'fadeIn 0.2s ease',
  } as React.CSSProperties,

  passwordHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    fontSize: '12px',
    lineHeight: 1.4,
  } as React.CSSProperties,
} as const

// Маленькие иконки (SVG inline, без внешних зависимостей)
const IconError = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="10" cy="10" r="9" stroke="#f87171" strokeWidth="2" />
    <path d="M10 6v4.5M10 13.5v.5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const IconAlertCircle = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="10" cy="10" r="9" stroke="#f87171" strokeWidth="2" />
    <path d="M10 6v4.5M10 13.5v.5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="8" cy="8" r="7" fill="#22c55e" />
    <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ─── Подсказка силы пароля ────────────────────────────────────────────────────
function PasswordStrengthHint({ password }: { password: string }) {
  if (!password) return null

  const len = password.length
  const hasUpper = /[A-Z]/.test(password)
  const hasDigit = /\d/.test(password)

  const checks = [
    { label: 'Мінімум 6 символів', ok: len >= 6 },
    { label: 'Велика літера', ok: hasUpper },
    { label: 'Цифра', ok: hasDigit },
  ]

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {checks.map(c => (
        <div key={c.label} style={{
          ...styles.passwordHint,
          color: c.ok ? '#16a34a' : '#6b7280',
        }}>
          {c.ok ? <IconCheck /> : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="8" cy="8" r="7" stroke="#d1d5db" strokeWidth="1.5" />
            </svg>
          )}
          {c.label}
        </div>
      ))}
    </div>
  )
}

// ─── Компонент поля ввода ──────────────────────────────────────────────────────
function FormField({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {error && (
        <div style={styles.fieldErrorWrap}>
          <IconError />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

// ─── Глобальная ошибка ─────────────────────────────────────────────────────────
function GeneralError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div style={styles.generalErrorWrap} role="alert">
      <IconAlertCircle />
      <span>{message}</span>
    </div>
  )
}

// ─── Глобальные keyframes (inject once) ───────────────────────────────────────
const globalCss = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-4px); }
    40% { transform: translateX(4px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .input-error {
    border-color: rgba(220, 38, 38, 0.7) !important;
    background-color: rgba(220, 38, 38, 0.06) !important;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.10) !important;
  }
`

let injected = false
function injectGlobalCss() {
  if (injected || typeof document === 'undefined') return
  const tag = document.createElement('style')
  tag.textContent = globalCss
  document.head.appendChild(tag)
  injected = true
}

// ─── Главный компонент ─────────────────────────────────────────────────────────
export function AuthScreen({ onLogin }: AuthScreenProps) {
  injectGlobalCss()

  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ email: '', password: '', username: '' })
  const [generalError, setGeneralError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [showPasswordHint, setShowPasswordHint] = useState(false)
  const toast = useToast()

  const setField = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }))
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }))
    setGeneralError('')
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (tab === 'register') {
      if (!form.username.trim()) {
        errors.username = "Поле обов'язкове"
      } else if (form.username.trim().length < 2) {
        errors.username = "Мінімум 2 символи"
      }
    }

    if (!form.email.trim()) {
      errors.email = "Поле обов'язкове"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = "Невірний формат електронної пошти"
    }

    if (!form.password) {
      errors.password = "Поле обов'язкове"
    } else if (form.password.length < 6) {
      errors.password = "Пароль має бути не менше 6 символів"
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async () => {
    setGeneralError('')
    if (!validate()) return

    setLoading(true)
    try {
      if (tab === 'login') {
        const { access_token, refresh_token } = await authApi.login(form.email, form.password)
        apiClient.setTokens(access_token, refresh_token)
        const user = await authApi.me()
        onLogin(user)
        toast('Вітаємо! Успішний вхід', 'success')
      } else {
        await authApi.register(form.username, form.email, form.password)
        toast('Акаунт створено. Увійдіть', 'success')
        setTab('login')
      }
    } catch (e: any) {
      const status = e?.response?.status || e?.status

      if (status === 401 || e?.message?.includes('401')) {
        toast('Невірні дані', 'error')
        setGeneralError('Невірна електронна пошта або пароль')

      } else if (status === 422 || e?.message?.includes('422')) {
        const detail = e?.response?.data?.detail || e?.data?.detail

        if (Array.isArray(detail)) {
          const newFieldErrors: Record<string, string> = {}
          let hasMapped = false

          detail.forEach(err => {
            const field = err.loc?.[err.loc.length - 1]
            if (field && Object.prototype.hasOwnProperty.call(form, field)) {
              newFieldErrors[field] = err.msg
              hasMapped = true
            }
          })

          if (hasMapped) {
            setFieldErrors(newFieldErrors)
            toast('Перевірте правильність заповнення полів', 'error')
          } else {
            setGeneralError(detail[0]?.msg || 'Помилка валідації')
          }
        } else if (typeof detail === 'string') {
          setGeneralError(detail)
        } else {
          setGeneralError('Помилка валідації (422)')
        }

      } else if (status === 409) {
        setGeneralError('Користувач з такими даними вже існує')

      } else {
        let errMsg = 'Невідома помилка сервера'
        if (typeof e?.response?.data?.detail === 'string') errMsg = e.response.data.detail
        else if (e instanceof Error) errMsg = e.message
        else if (typeof e === 'string') errMsg = e
        setGeneralError(errMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
  }

  const switchTab = (t: 'login' | 'register') => {
    setTab(t)
    setGeneralError('')
    setFieldErrors({})
    setShowPasswordHint(false)
  }

  return (
    <div className="auth-screen">
      <div className="auth-grid" />
      <div className="auth-box">
        <div className="auth-header">
          <div className="auth-logo">
            <div className="logo-mark">SD</div>
            <div>
              <div className="auth-title">SERVICE DESK</div>
              <div className="auth-sub">Технічна підтримка</div>
            </div>
          </div>
        </div>

        <div className="auth-body">
          <div className="auth-tabs">
            <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>
              Вхід
            </button>
            <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>
              Реєстрація
            </button>
          </div>

          {tab === 'register' && (
            <FormField label="Ім'я користувача" error={fieldErrors.username}>
              <input
                className={`form-input ${fieldErrors.username ? 'input-error' : ''}`}
                placeholder="user_123"
                value={form.username}
                onChange={e => setField('username', e.target.value)}
                onKeyDown={handleKey}
                autoComplete="username"
              />
            </FormField>
          )}

          <FormField label="Електронна пошта" error={fieldErrors.email}>
            <input
              className={`form-input ${fieldErrors.email ? 'input-error' : ''}`}
              type="email"
              placeholder="email@domain.com"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              onKeyDown={handleKey}
              autoComplete="email"
            />
          </FormField>

          <FormField label="Пароль" error={fieldErrors.password}>
            <input
              className={`form-input ${fieldErrors.password ? 'input-error' : ''}`}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setField('password', e.target.value)}
              onFocus={() => tab === 'register' && setShowPasswordHint(true)}
              onBlur={() => setShowPasswordHint(false)}
              onKeyDown={handleKey}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
            {/* Подсказки по паролю при регистрации */}
            {tab === 'register' && showPasswordHint && !fieldErrors.password && (
              <PasswordStrengthHint password={form.password} />
            )}
          </FormField>

          <GeneralError message={generalError} />

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={submit}
            disabled={loading}
          >
            {loading && <Spinner size={14} />}
            {tab === 'login' ? 'Увійти в систему' : 'Створити акаунт'}
          </button>
        </div>
      </div>
    </div>
  )
}