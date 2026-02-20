// ============== API CLIENT ==============

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const TOKEN_KEY = 'sd_token'
const REFRESH_TOKEN_KEY = 'sd_refresh_token'

export const apiClient = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
  isRefreshing: false, // Прапорець, щоб не спамити рефреш-запитами

  setTokens(access: string, refresh: string) {
    this.token = access
    this.refreshToken = refresh
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  },

  clearTokens() {
    this.token = ''
    this.refreshToken = ''
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },

  async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`

    let res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // МАГІЯ: Якщо отримали 401, пробуємо оновити токен
    if (res.status === 401 && this.refreshToken && !this.isRefreshing) {
      this.isRefreshing = true
      
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: this.refreshToken }),
        })

        if (refreshRes.ok) {
          const data = await refreshRes.json()
          // Зберігаємо нові токени (Бекенд має повернути access_token та refresh_token)
          this.setTokens(data.access_token, data.refresh_token || this.refreshToken)
          
          // ПОВТОРЮЄМО початковий запит з новим токеном
          headers['Authorization'] = `Bearer ${this.token}`
          res = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          })
        } else {
          // Якщо рефреш теж здох — тоді вже точно на логін
          this.clearTokens()
          window.location.href = '/login'
        }
      } catch (e) {
        this.clearTokens()
      } finally {
        this.isRefreshing = false
      }
    }

    // Обробка помилок сервера (як і було)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Помилка сервера')
    return data as T
  },

  get<T>(path: string) { return this.req<T>('GET', path) },
  post<T>(path: string, body: unknown) { return this.req<T>('POST', path, body) },
  patch<T>(path: string, body: unknown) { return this.req<T>('PATCH', path, body) },
  delete<T>(path: string) { return this.req<T>('DELETE', path) },
}

// ============== API METHODS ==============
import type { User, Problem, Token, AdminResponse, ServiceRecord } from '../types'

export const authApi = {
  login: async (email: string, password: string) => {
    // Оновлено: зберігаємо обидва токени при логіні
    const data = await apiClient.post<Token & { refresh_token: string }>('/login', { email, password })
    apiClient.setTokens(data.access_token, data.refresh_token)
    return data
  },

  register: (username: string, email: string, password: string) =>
    apiClient.post<User>('/register', { username, email, password }),

  me: () => apiClient.get<User>(`/users/me?t=${Date.now()}`),

  updateMe: (data: Partial<{ username: string; email: string; password: string }>) =>
    apiClient.patch<User>('/users/me', data),

  deleteMe: () => apiClient.delete<User>('/users/me'),

  makeAdmin: () => apiClient.post<User>('/users/makeadmin', {}),

  verifyEmail: (code: string) =>
    apiClient.post<{ message: string }>('/verify-email', { code }),

  resendCode: () =>
    apiClient.post<{ message: string }>('/resend-code', {}),

  generateTgLink: () => 
    apiClient.post<{ link: string }>('/users/telegram/generate-link', {}),

  unlinkTg: () => apiClient.patch<User>('/users/telegram/unlink', {}),
}

export const problemsApi = {
  list: () => apiClient.get<Problem[]>('/problems'),
  get: (id: number) => apiClient.get<Problem>(`/problems/${id}`),
  create: (data: { title: string; description: string; image_url?: string }) =>
    apiClient.post<Problem>('/problems', data),
  delete: (id: number) => apiClient.delete<Problem>(`/problems/${id}`),
  assign: (id: number) => apiClient.patch<Problem>(`/problems/${id}/assign`, {}),
  updateStatus: (id: number, status: string) =>
    apiClient.patch<Problem>(`/problems/${id}/status`, { status }),
}

export const adminApi = {
  respond: (problem_id: number, message: string) =>
    apiClient.post<AdminResponse>('/problems/response', { problem_id, message }),
  createServiceRecord: (data: {
    problem_id: number
    user_id: number
    work_done: string
    warranty_info: string
    used_parts?: string[]
  }) => apiClient.post<ServiceRecord>('/service-record', data),
  getServiceRecord: (problem_id: number) =>
    apiClient.get<ServiceRecord>(`/service-record/${problem_id}`),
}