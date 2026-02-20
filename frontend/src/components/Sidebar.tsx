import type { User, Page } from '../types'

interface SidebarProps {
  user: User
  page: Page
  onNavigate: (page: Page) => void
  onLogout: () => void
  isOpen?: boolean
  onClose?: () => void
}

const navItems: { id: Page; icon: string; label: string }[] = [
  { id: 'problems', icon: '◫', label: 'Заявки' },
  { id: 'profile',  icon: '◈', label: 'Профіль' },
]

export function Sidebar({ user, page, onNavigate, onLogout, isOpen, onClose }: SidebarProps) {
  return (
    <nav className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>

      {/* ── Logo ── */}
      <div className="sidebar-logo">
        <div className="logo-mark">SD</div>
        <div style={{ flex: 1 }}>
          <div className="logo-text">SERVICE DESK</div>
          <div className="logo-sub">Підтримка</div>
        </div>
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Закрити меню">
          ✕
        </button>
      </div>

      {/* ── Nav ── */}
      <div className="nav-section">
        <div className="nav-label">Навігація</div>

        {navItems.map(item => (
          <div
            key={item.id}
            className={`nav-item${page === item.id ? ' active' : ''}`}
            onClick={() => { onNavigate(item.id); onClose?.() }}
          >
            <span className="nav-icon">{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {page === item.id && (
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: 'var(--accent)', flexShrink: 0,
              }} />
            )}
          </div>
        ))}

        {/* ── Admin section ── */}
        {user.is_admin && (
          <>
            <div className="nav-label" style={{ marginTop: 20 }}>Адмін</div>
            <div
              className={`nav-item${page === 'my-tasks' ? ' active' : ''}`}
              onClick={() => { onNavigate('my-tasks'); onClose?.() }}
            >
              <span className="nav-icon">◉</span>
              <span style={{ flex: 1 }}>Мої задачі</span>
              {page === 'my-tasks' && (
                <span style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'var(--accent)', flexShrink: 0,
                }} />
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── User block ── */}
      <div className="sidebar-bottom">
        <div
          className="sidebar-user"
          onClick={() => { onNavigate('profile'); onClose?.() }}
        >
          <div className="sidebar-user-avatar">
            {user.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.username}</div>
            <div className="sidebar-user-role">
              {user.is_admin
                ? <><span className="sidebar-user-role-dot" style={{ background: 'var(--accent)' }} />Адміністратор</>
                : <><span className="sidebar-user-role-dot" />Користувач</>
              }
            </div>
          </div>
        </div>

        <button
          className="sidebar-logout-btn"
          onClick={onLogout}
        >
          <span style={{ fontSize: 11, opacity: 0.6 }}>⎋</span>
          Вийти
        </button>
      </div>

    </nav>
  )
}