import { useEffect, useState } from 'react'
import { apiClient, authApi } from './api'
import { ToastProvider } from './context/ToastContext'
import { useToast } from './context/ToastContext'
import { AuthScreen } from './components/AuthScreen'
import { Sidebar } from './components/Sidebar'
import { VerifyBanner } from './components/VerifyBanner'
import { ProblemsList } from './pages/ProblemsList'
import { ProblemDetail } from './pages/ProblemDetail'
import { ProfilePage } from './pages/ProfilePage'
import type { User, Problem, Page } from './types'
import { AdminMyProblems } from './pages/AdminMyProblemsList'

// ============== ГОЛОВНА СТОРІНКА (LANDING) ==============
function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="auth-screen" style={{ flexDirection: 'column', textAlign: 'center' }}>
      <div className="auth-grid" />
      
      <div style={{ position: 'relative', zIndex: 10, maxWidth: '600px', padding: '0 20px', animation: 'fadeUp 0.6s ease forwards' }}>
        <div 
          className="logo-mark" 
          style={{ width: '64px', height: '64px', fontSize: '24px', margin: '0 auto 24px' }}
        >
          SD
        </div>
        
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '42px', fontWeight: 800, marginBottom: '16px', letterSpacing: '0.02em', color: 'var(--text)' }}>
          SERVICE DESK
        </h1>
        
        <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: '1.6', marginBottom: '32px', fontFamily: 'var(--font-mono)' }}>
          Швидка та зручна система для подачі заявок на технічну підтримку. 
          Створюйте тікети, відслідковуйте їхній статус та отримуйте допомогу від адміністраторів у реальному часі.
        </p>
        
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            style={{ padding: '12px 24px', fontSize: '13px' }}
            onClick={onStart}
          >
            Увійти в систему
          </button>
        </div>
      </div>
    </div>
  )
}

// ============== ОСНОВНИЙ КОМПОНЕНТ APP ==============
function AppContent() {
  const [user, setUser] = useState<User | null>(null)
  const toast = useToast()

  // Глобальний обробник 429 від apiClient
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail
      toast(msg, 'error')
    }
    window.addEventListener('api:too-many-requests', handler)
    return () => window.removeEventListener('api:too-many-requests', handler)
  }, [toast])
  const [loading, setLoading] = useState(true)
  // Новий стан для відображення Landing Page
  const [showLanding, setShowLanding] = useState(true) 
  
  const [page, setPage] = useState<Page>(() => {
    return (sessionStorage.getItem('desk_page') as Page) || 'problems'
  })
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(() => {
    const saved = sessionStorage.getItem('desk_problem')
    return saved ? JSON.parse(saved) : null
  })

  useEffect(() => {
    sessionStorage.setItem('desk_page', page)
    if (selectedProblem) {
      sessionStorage.setItem('desk_problem', JSON.stringify(selectedProblem))
    } else {
      sessionStorage.removeItem('desk_problem')
    }
  }, [page, selectedProblem])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [problems, setProblems] = useState<Problem[]>([])

  useEffect(() => {
    if (apiClient.token) {
      authApi.me()
        .then(u => {
          setUser(u)
          setShowLanding(false) // Якщо токен є і він валідний, ховаємо Landing
        })
        .catch(() => apiClient.clearTokens())
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
    apiClient.clearTokens()
    setUser(null)
    setShowLanding(true) // Після виходу повертаємо на головну
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

  // Якщо користувач НЕ авторизований
  if (!user) {
    if (showLanding) {
      // Показуємо красиву головну сторінку
      return <LandingPage onStart={() => setShowLanding(false)} />
    }
    // Якщо натиснули "Увійти в систему", показуємо форму логіну/реєстрації
    return <AuthScreen onLogin={setUser} />
  }

  // Якщо користувач авторизований, показуємо інтерфейс
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
              {/* ИСПРАВЛЕНИЕ 1: Учитываем страницу my-tasks */}
              {page === 'problems' ? 'Всі заявки' : page === 'my-tasks' ? 'Мої задачі' : 'Профіль'}
              {selectedProblem && (
                <>
                  <span className="topbar-sep">/</span>
                  #{String(selectedProblem.id).padStart(4, '0')}
                </>
              )}
            </div>
            <div className="topbar-title">
              {/* ИСПРАВЛЕНИЕ 2: Учитываем страницу my-tasks в заголовке */}
              {selectedProblem
                ? selectedProblem.title
                : page === 'problems' 
                  ? 'Мої заявки' 
                  : page === 'my-tasks' 
                    ? 'Мої задачі' 
                    : 'Профіль'}
            </div>
          </div>

          <div className="topbar-actions">
            {user.is_admin && (
              <span className="badge badge-admin" style={{ animation: 'glow 2s ease-in-out infinite' }}>
                ◆ ADMIN
              </span>
            )}
          </div>
        </div>

        <div className="content">
          <VerifyBanner user={user} onVerified={setUser} />
          
          {page === 'problems' && !selectedProblem && (
            <ProblemsList user={user} onSelect={setSelectedProblem} />
          )}
          
          {page === 'my-tasks' && !selectedProblem && (
            <AdminMyProblems user={user} onSelect={setSelectedProblem} />
          )}

          {/* ИСПРАВЛЕНИЕ 3: Разрешаем показывать ProblemDetail на обеих вкладках */}
          {(page === 'problems' || page === 'my-tasks') && selectedProblem && (
            <ProblemDetail
              problem={selectedProblem}
              user={user}
              onBack={() => setSelectedProblem(null)}
              onUpdate={(updated) => {
                setProblems(prev => prev.map(p => p.id === updated.id ? updated : p))
              }}
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