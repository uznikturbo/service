// ============== API CLIENT ==============

// В Docker: VITE_API_URL=/api (nginx проксирует на бэкенд)
// Локально: VITE_API_URL=http://localhost:8000
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const TOKEN_KEY = 'sd_token'

export const apiClient = {
  token: localStorage.getItem(TOKEN_KEY) || '',

  setToken(t: string) {
    this.token = t
    localStorage.setItem(TOKEN_KEY, t)
  },

  clearToken() {
    this.token = ''
    localStorage.removeItem(TOKEN_KEY)
  },

  async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401) {
      this.clearToken()
      window.location.reload()
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || 'Помилка сервера')
    return data as T
  },

  get<T>(path: string) {
    return this.req<T>('GET', path)
  },
  post<T>(path: string, body: unknown) {
    return this.req<T>('POST', path, body)
  },
  patch<T>(path: string, body: unknown) {
    return this.req<T>('PATCH', path, body)
  },
  delete<T>(path: string) {
    return this.req<T>('DELETE', path)
  },
}

// ============== API METHODS ==============
import type { User, Problem, Token, AdminResponse, ServiceRecord } from '../types'

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<Token>('/login', { email, password }),

  register: (username: string, email: string, password: string) =>
    apiClient.post<User>('/register', { username, email, password }),

  me: () => apiClient.get<User>('/users/me'),

  updateMe: (data: Partial<{ username: string; email: string; password: string }>) =>
    apiClient.patch<User>('/users/me', data),

  deleteMe: () => apiClient.delete<User>('/users/me'),

  makeAdmin: () => apiClient.post<User>('/users/makeadmin', {}),

  verifyEmail: (code: string) =>
    apiClient.post<{ message: string }>('/verify-email', { code }),

  resendCode: () =>
    apiClient.post<{ message: string }>('/resend-code', {}),
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
