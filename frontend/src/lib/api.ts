// lib/api.ts — v2, JWT-only, no Firebase
import axios, { AxiosInstance } from 'axios'
import toast from 'react-hot-toast'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

class ApiClient {
  private client: AxiosInstance
  private token: string | null = null

  constructor() {
    this.client = axios.create({ baseURL: BASE_URL, timeout: 30000 })

    this.client.interceptors.request.use((config) => {
      if (this.token) config.headers.Authorization = `Bearer ${this.token}`
      return config
    })

    this.client.interceptors.response.use(
      (res) => res.data,
      (err) => {
        if (!err.response) {
          console.error(`Network error: ${err.config?.url} — is the backend running?`)
          toast.error('Cannot reach server. Check backend is running.')
          return Promise.reject(new Error('Network error'))
        }
        const msg = err.response?.data?.detail || err.message || 'Request failed'
        if (err.response?.status === 401) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('aical-auth-v2')
            // Don't redirect if already on an auth page — prevents infinite reload loop
            const onAuthPage = ['/login', '/setup'].some(p =>
              window.location.pathname.startsWith(p)
            )
            if (!onAuthPage) {
              window.location.href = '/login'
            }
          }
        } else if (err.response?.status !== 422) {
          toast.error(msg)
        }
        return Promise.reject(new Error(msg))
      }
    )
  }

  setToken(t: string | null) { this.token = t }

  async get<T = any>(path: string, params?: object): Promise<T>    { return this.client.get(path, { params }) as any }
  async post<T = any>(path: string, data?: object): Promise<T>     { return this.client.post(path, data) as any }
  async patch<T = any>(path: string, data?: object): Promise<T>    { return this.client.patch(path, data) as any }
  async put<T = any>(path: string, data?: object): Promise<T>      { return this.client.put(path, data) as any }
  async delete<T = any>(path: string): Promise<T>                  { return this.client.delete(path) as any }
  async upload<T = any>(path: string, formData: FormData): Promise<T> {
    return this.client.post(path, formData, { headers: { 'Content-Type': 'multipart/form-data' } }) as any
  }
}

export const apiClient = new ApiClient()

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  setupStatus:    ()                => apiClient.get('/auth/setup-status'),
  setup:          (d: object)       => apiClient.post('/auth/setup', d),
  login:          (d: object)       => apiClient.post('/auth/login', d),
  me:             ()                => apiClient.get('/auth/me'),
  changePassword: (d: object)       => apiClient.post('/auth/change-password', d),
}

// ── Company ───────────────────────────────────────────────────────────────────
export const companyApi = {
  get:               ()       => apiClient.get('/company/'),
  create:            (d: any) => apiClient.post('/company/', d),
  update:            (d: any) => apiClient.patch('/company/', d),
  integrationStatus: ()       => apiClient.get('/company/integration-status'),
  saveIntegrations:  (d: any) => apiClient.patch('/company/integrations', d),
}

// ── License ───────────────────────────────────────────────────────────────────
export const licenseApi = {
  status:  ()  => apiClient.get('/license'),
  refresh: ()  => apiClient.post('/license/refresh'),
}

// ── Leads ─────────────────────────────────────────────────────────────────────
export const leadsApi = {
  list:      (p?: object) => apiClient.get('/leads/', p),
  get:       (id: string) => apiClient.get(`/leads/${id}`),
  create:    (d: object)  => apiClient.post('/leads/', d),
  update:    (id: string, d: object) => apiClient.patch(`/leads/${id}`, d),
  delete:    (id: string) => apiClient.delete(`/leads/${id}`),
  stats:     ()           => apiClient.get('/leads/stats'),
  importCsv: (f: FormData) => apiClient.upload('/leads/import/csv', f),
}

// ── Calls ─────────────────────────────────────────────────────────────────────
export const callsApi = {
  list:           (p?: object) => apiClient.get('/calls/', p),
  get:            (id: string) => apiClient.get(`/calls/${id}`),
  stats:          ()           => apiClient.get('/calls/stats'),
  hangup:         (cid: string) => apiClient.post(`/telephony/calls/${cid}/hangup`),
  liveTranscript: (cid: string) => apiClient.get(`/telephony/calls/${cid}/transcript`),
}

// ── Batches ───────────────────────────────────────────────────────────────────
export const batchesApi = {
  list:    (p?: object) => apiClient.get('/batches/', p),
  get:     (id: string) => apiClient.get(`/batches/${id}`),
  create:  (d: object)  => apiClient.post('/batches/', d),
  delete:  (id: string) => apiClient.delete(`/batches/${id}`),
  pause:   (id: string) => apiClient.patch(`/batches/${id}/pause`),
  preview: (p: object)  => apiClient.get('/batches/preview', p),
}

// ── Schedules ─────────────────────────────────────────────────────────────────
export const schedulesApi = {
  list:   (p?: object) => apiClient.get('/schedules/', p),
  create: (d: object)  => apiClient.post('/schedules/', d),
  update: (id: string, d: object) => apiClient.patch(`/schedules/${id}`, d),
  delete: (id: string) => apiClient.delete(`/schedules/${id}`),
}

// ── Knowledge ─────────────────────────────────────────────────────────────────
export const knowledgeApi = {
  list:   ()           => apiClient.get('/knowledge/'),
  upload: (f: FormData) => apiClient.upload('/knowledge/upload', f),
  delete: (id: string) => apiClient.delete(`/knowledge/${id}`),
}