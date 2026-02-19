// ============== TYPES ==============

export interface User {
  id: number
  username: string
  email: string
  is_admin: boolean
  is_verified: boolean
}

export interface AdminResponse {
  id: number
  message: string
  date_responded: string
  admin_id: number
  problem_id: number
}

export interface ServiceRecord {
  id: number
  work_done: string
  used_parts?: string[]
  warranty_info: string
  date_completed: string
  problem_id: number
}

export interface Problem {
  id: number
  title: string
  description: string
  image_url?: string
  status: string
  date_created: string
  user_id: number
  admin_id?: number
  response?: AdminResponse
  service_record?: ServiceRecord
}

export interface Token {
  access_token: string
  token_type: string
}

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  msg: string
  type: ToastType
}

export type Page = 'problems' | 'profile'