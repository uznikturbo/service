import { useEffect, useState } from 'react'
import { apiClient, authApi } from './api'
import { ToastProvider } from './context/ToastContext'
import { AuthScreen } from './components/AuthScreen'
import { Sidebar } from './components/Sidebar'
import { ProblemsList } from './pages/ProblemsList'
import { ProblemDetail } from './pages/ProblemDetail'
import { ProfilePage } from './pages/ProfilePage'
import type { User, Problem, Page } from './types'

function AppContent() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('problems')
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (apiClient.token) {
      authApi.me()
        .then(u => setUser(u))
        .catch(() => apiClient.clearToken())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const navigate = (p: Page) => {
    setPage(p)
    setSelectedProblem(null)
    setSidebarOpen(false)
  }

  const logout = () => {
    apiClient.clearToken()
    setUser(null)
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="logo-mark">SD</div>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 18, letterSpacing: '0.05em' }}>
            SERVICE DESK
          </div>
        </div>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onLogin={setUser} />
  }

  return (
    <div className="app">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        user={user}
        page={page}
        onNavigate={navigate}
        onLogout={logout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <div className="topbar">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Відкрити меню"
          >
            <span /><span /><span />
          </button>

          <div className="topbar-info">
            <div className="topbar-breadcrumb">
              Service Desk
              <span className="topbar-sep">/</span>
              {page === 'problems' ? 'Заявки' : 'Профіль'}
              {selectedProblem && (
                <>
                  <span className="topbar-sep">/</span>
                  #{String(selectedProblem.id).padStart(4, '0')}
                </>
              )}
            </div>
            <div className="topbar-title">
              {selectedProblem
                ? selectedProblem.title
                : page === 'problems' ? 'Мої заявки' : 'Профіль'}
            </div>
          </div>

          <div className="topbar-actions">
            {user.is_admin && (
              <span className="badge badge-admin" style={{ animation: 'glow 2s ease-in-out infinite' }}>
                ◆ ADMIN
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={logout}>Вийти</button>
          </div>
        </div>

        <div className="content">
          {page === 'problems' && !selectedProblem && (
            <ProblemsList user={user} onSelect={setSelectedProblem} />
          )}
          {page === 'problems' && selectedProblem && (
            <ProblemDetail
              problem={selectedProblem}
              user={user}
              onBack={() => setSelectedProblem(null)}
            />
          )}
          {page === 'profile' && (
            <ProfilePage user={user} onUpdate={setUser} onLogout={logout} />
          )}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
