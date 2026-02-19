import { useState } from 'react'
import { apiClient, authApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Spinner } from './ui'
import type { User } from '../types'

interface AuthScreenProps {
  onLogin: (user: User) => void
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ email: '', password: '', username: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  const setField = (key: string, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      if (tab === 'login') {
        const { access_token } = await authApi.login(form.email, form.password)
        apiClient.setToken(access_token)
        const user = await authApi.me()
        onLogin(user)
        toast('Вітаємо! Успішний вхід', 'success')
      } else {
        await authApi.register(form.username, form.email, form.password)
        toast('Акаунт створено. Увійдіть', 'success')
        setTab('login')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Помилка')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
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
            <button
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => setTab('login')}
            >
              Вхід
            </button>
            <button
              className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => setTab('register')}
            >
              Реєстрація
            </button>
          </div>

          {tab === 'register' && (
            <div className="form-group">
              <label className="form-label">Ім'я користувача</label>
              <input
                className="form-input"
                placeholder="user_123"
                value={form.username}
                onChange={e => setField('username', e.target.value)}
                onKeyDown={handleKey}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Електронна пошта</label>
            <input
              className="form-input"
              type="email"
              placeholder="email@domain.com"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setField('password', e.target.value)}
              onKeyDown={handleKey}
            />
          </div>

          {error && (
            <div className="form-error" style={{ marginBottom: 12 }}>
              ⚠ {error}
            </div>
          )}

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
