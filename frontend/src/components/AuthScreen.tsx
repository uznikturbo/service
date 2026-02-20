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
    } catch (e: any) {
      // Витягуємо статус з різних можливих форматів відповіді
      const status = e?.response?.status || e?.status;

      if (status === 401 || e?.message?.includes('401')) {
        toast('Невірні дані', 'error')
        setError('Невірна електронна пошта або пароль')
        
      } else if (status === 422 || e?.message?.includes('422')) {
        // FastAPI зазвичай ховає помилки 422 в полі detail
        const detail = e?.response?.data?.detail || e?.data?.detail;
        
        if (Array.isArray(detail) && detail.length > 0) {
          // Якщо це масив помилок Pydantic (наприклад, занадто короткий пароль)
          const msg = detail[0].msg || 'Перевірте правильність введених даних';
          toast('Помилка валідації', 'error');
          setError(`Помилка: ${msg}`);
        } else if (typeof detail === 'string') {
          // Якщо FastAPI повернув звичайний рядок
          toast('Помилка валідації', 'error');
          setError(detail);
        } else {
          // Резервний варіант
          toast('Перевірте введені дані', 'error');
          setError('Помилка валідації (422)');
        }
        
      } else {
        // Для всіх інших помилок гарантуємо, що це буде рядок, а не [object Object]
        let errMsg = 'Невідома помилка';
        if (e?.response?.data?.detail && typeof e.response.data.detail === 'string') {
          errMsg = e.response.data.detail;
        } else if (e instanceof Error) {
          errMsg = e.message;
        } else if (typeof e === 'string') {
          errMsg = e;
        }
        
        setError(errMsg);
      }
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
