import { useState } from 'react'
import { apiClient, authApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Spinner } from '../components/ui'
import type { User } from '../types'

interface ProfilePageProps {
  user: User & { telegram_id?: number | null }
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
  const [tgLoading, setTgLoading] = useState(false)
  const [unlinkLoading, setUnlinkLoading] = useState(false) // Состояние загрузки для отвязки
  const [isTgHovered, setIsTgHovered] = useState(false) // Состояние наведения мыши
  
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

  // Прив'язка Telegram
  const linkTelegram = async () => {
    setTgLoading(true)
    try {
      const { link } = await authApi.generateTgLink()
      window.open(link, '_blank')
      toast('Перейдіть у Telegram та натисніть Start', 'info')

      const intervalId = setInterval(async () => {
        try {
          const freshUser = await authApi.me()
          if (freshUser.telegram_id) {
            onUpdate(freshUser)
            toast('Telegram успішно прив\'язано!', 'success')
            clearInterval(intervalId)
          }
        } catch (err) {
          // Игнорируем ошибки сети при поллинге
        }
      }, 3000)

      setTimeout(() => clearInterval(intervalId), 180000)
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setTgLoading(false)
    }
  }

  // ВІДВ'ЯЗКА Telegram
  const unlinkTelegram = async () => {
    if (!confirm("Ви впевнені, що хочете відв'язати Telegram? Ви більше не отримуватимете важливі сповіщення.")) return
    setUnlinkLoading(true)
    try {
      const updatedUser = await authApi.unlinkTg()
      onUpdate(updatedUser) // Оновлюємо стейт, кнопка зміниться назад на синю
      toast("Акаунт Telegram відв'язано", 'success')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setUnlinkLoading(false)
      setIsTgHovered(false) // Скидаємо hover після відв'язки
    }
  }

  const deleteAccount = async () => {
    if (!confirm('Видалити акаунт? Цю дію неможливо скасувати.')) return
    try {
      await authApi.deleteMe()
      apiClient.clearTokens()
      onLogout()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    }
  }

  const logout = () => {
    apiClient.clearTokens()
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

      {/* Telegram Integration Card */}
      <div className="card" style={{ borderColor: 'rgba(59,130,246,0.25)', marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title" style={{ color: '#3b82f6' }}>Сповіщення Telegram</div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
            Прив'яжіть свій Telegram, щоб миттєво отримувати сповіщення про зміну статусів ваших заявок та відповіді адміністраторів.
          </p>
          
          {user.telegram_id ? (
            // ИНТЕРАКТИВНАЯ КНОПКА ОТВЯЗКИ
            <button 
              className="btn" 
              style={{ 
                background: isTgHovered ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', 
                color: isTgHovered ? 'var(--red)' : 'var(--green)', 
                borderColor: isTgHovered ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)',
                transition: 'all 0.2s ease'
              }} 
              onMouseEnter={() => setIsTgHovered(true)}
              onMouseLeave={() => setIsTgHovered(false)}
              onClick={unlinkTelegram} 
              disabled={unlinkLoading}
            >
              {unlinkLoading ? <Spinner size={12} /> : (isTgHovered ? "✕ Відв'язати Telegram" : "✓ Акаунт Telegram прив'язано")}
            </button>
          ) : (
            <button className="btn btn-primary" style={{ background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' }} onClick={linkTelegram} disabled={tgLoading}>
              {tgLoading ? <Spinner size={12} /> : '✈'}
              Прив'язати Telegram
            </button>
          )}
        </div>
      </div>

      {/* Make Admin */}
      {!user.is_admin && (
        <div className="card" style={{ borderColor: 'rgba(245,158,11,0.25)', marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title" style={{ color: 'var(--accent)' }}>Права адміністратора</div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
              Отримати повні права адміна: перегляд усіх заявок, відповіді, зміна статусів, сервісні записи. Це незворотня дія.
            </p>
            <button className="btn btn-ghost" style={{ color: 'var(--accent)', borderColor: 'rgba(245,158,11,0.3)' }} onClick={makeAdmin} disabled={adminLoading}>
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