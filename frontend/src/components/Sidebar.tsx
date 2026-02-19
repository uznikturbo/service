import type { User, Page } from '../types'

interface SidebarProps {
  user: User
  page: Page
  onNavigate: (page: Page) => void
  onLogout: () => void
}

const navItems: { id: Page; icon: string; label: string }[] = [
  { id: 'problems', icon: '◫', label: 'Заявки' },
  { id: 'profile', icon: '◈', label: 'Профіль' },
]

export function Sidebar({ user, page, onNavigate, onLogout }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">SD</div>
        <div>
          <div className="logo-text">SERVICE DESK</div>
          <div className="logo-sub">Підтримка</div>
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-label">Навігація</div>
        {navItems.map(item => (
          <div
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      <div className="sidebar-bottom">
        <div className="user-card" onClick={() => onNavigate('profile')}>
          <div className="user-avatar">
            {user.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <div className="user-name">{user.username}</div>
            <div className="user-role">
              {user.is_admin ? 'Адміністратор' : 'Користувач'}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
