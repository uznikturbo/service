import { useState } from 'react'
import { apiClient, authApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Spinner } from '../components/ui'
import type { User } from '../types'

interface ProfilePageProps {
  user: User
  onUpdate: (user: User) => void
  onLogout: () => void
}

export function ProfilePage({ user, onUpdate, onLogout }: ProfilePageProps) {
  const [form, setForm] = useState({
    username: user.username,
    email: user.email,
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [adminLoading, setAdminLoading] = useState(false)
  const toast = useToast()

  const makeAdmin = async () => {
    if (!confirm('Отримати права адміністратора? Це незворотня дія.')) return
    setAdminLoading(true)
    try {
      const updated = await authApi.makeAdmin()
      onUpdate(updated)
      toast('Тепер ви адміністратор!', 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setAdminLoading(false)
    }
  }

  const setField = (key: string, value: string) =>
    setForm(f => ({ ...f, [key]: value }))

  const save = async () => {
    setLoading(true)
    try {
      const payload: Partial<{ username: string; email: string; password: string }> = {}
      if (form.username !== user.username) payload.username = form.username
      if (form.email !== user.email) payload.email = form.email
      if (form.password) payload.password = form.password

      const emailChanged = !!payload.email

      const updated = await authApi.updateMe(payload)
      onUpdate(updated)
      setForm(f => ({ ...f, password: '' }))

      if (emailChanged) {
        toast('Email змінено — підтвердьте нову адресу', 'info')
      } else {
        toast('Профіль оновлено', 'success')
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setLoading(false)
    }
  }

  const deleteAccount = async () => {
    if (!confirm('Видалити акаунт? Цю дію неможливо скасувати.')) return
    try {
      await authApi.deleteMe()
      apiClient.clearToken()
      onLogout()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    }
  }

  const logout = () => {
    apiClient.clearToken()
    onLogout()
  }

  return (
    <div className="animate-fadeUp" style={{ maxWidth: 500 }}>
      {/* Profile card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Профіль</div>
          {user.is_admin && <span className="badge badge-admin">◆ Адміністратор</span>}
        </div>
        <div className="card-body">
          {/* Avatar block */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              marginBottom: 24,
              padding: 16,
              background: 'var(--bg3)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--accent-dim)',
                border: '1px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 800,
                color: 'var(--accent)',
                fontFamily: 'var(--font-head)',
                flexShrink: 0,
              }}
            >
              {user.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16 }}>
                {user.username}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{user.email}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                uid:{user.id}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Ім'я користувача</label>
            <input
              className="form-input"
              value={form.username}
              onChange={e => setField('username', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Електронна пошта</label>
            <input
              className="form-input"
              type="email"
              value={form.email}
              onChange={e => setField('email', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Новий пароль (залишіть пустим щоб не змінювати)</label>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={e => setField('password', e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading && <Spinner size={12} />}
            Зберегти зміни
          </button>
        </div>
      </div>

      {/* Make Admin */}
      {!user.is_admin && (
        <div className="card" style={{ borderColor: 'rgba(59,130,246,0.25)', marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title" style={{ color: 'var(--blue)' }}>Права адміністратора</div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
              Отримати повні права адміна: перегляд усіх заявок, відповіді, зміна статусів, сервісні записи. Це незворотня дія.
            </p>
            <button className="btn btn-ghost" style={{ color: 'var(--blue)', borderColor: 'rgba(59,130,246,0.3)' }} onClick={makeAdmin} disabled={adminLoading}>
              {adminLoading ? <Spinner size={12} /> : '◆'}
              Стати адміністратором
            </button>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="card" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
        <div className="card-header">
          <div className="card-title" style={{ color: 'var(--red)' }}>Небезпечна зона</div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Видалення акаунту — незворотня дія. Всі ваші дані буде втрачено.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" onClick={deleteAccount}>✕ Видалити акаунт</button>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Вийти з системи</button>
          </div>
        </div>
      </div>
    </div>
  )
}