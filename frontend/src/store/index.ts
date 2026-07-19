// store/index.ts — v2 JWT auth, no Firebase
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '@/lib/api'

interface User {
  id:         string
  email:      string
  full_name:  string
  is_active:  boolean
  created_at: string
}

interface License {
  valid:           boolean
  active:          boolean
  tier:            string
  client_name:     string
  expires_at:      string | null
  days_remaining:  number | null
  max_leads:       number
  max_calls_month: number
  last_verified:   string | null
  grace_until:     string | null
  message:         string
}

interface AuthState {
  token:       string | null
  user:        User | null
  license:     License | null
  company:     any | null
  loading:     boolean
  setupNeeded: boolean

  login:        (email: string, password: string) => Promise<void>
  logout:       () => void
  fetchMe:      () => Promise<void>
  fetchCompany: () => Promise<void>
  fetchLicense: () => Promise<void>
  checkSetup:   () => Promise<boolean>
  setToken:     (token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token:       null,
      user:        null,
      license:     null,
      company:     null,
      loading:     false,
      setupNeeded: false,

      setToken: (token) => {
        apiClient.setToken(token)
        set({ token })
      },

      login: async (email, password) => {
        set({ loading: true })
        try {
          const data: any = await apiClient.post('/auth/login', { email, password })
          apiClient.setToken(data.token)
          set({ token: data.token, user: data.user, loading: false })
          // Fetch license and company after login
          get().fetchLicense()
          get().fetchCompany()
        } catch (e) {
          set({ loading: false })
          throw e
        }
      },

      logout: () => {
        apiClient.setToken(null)
        set({ token: null, user: null, license: null, company: null })
      },

      fetchMe: async () => {
        try {
          const data: any = await apiClient.get('/auth/me')
          set({ user: data.user, license: data.license })
        } catch {
          get().logout()
        }
      },

      fetchLicense: async () => {
        try {
          const data: any = await apiClient.get('/license')
          set({ license: data })
        } catch {}
      },

      fetchCompany: async () => {
        try {
          const data: any = await apiClient.get('/company/')
          set({ company: data })
        } catch {}
      },

      checkSetup: async () => {
        try {
          const data: any = await apiClient.get('/auth/setup-status')
          const needed = !data.setup_complete
          set({ setupNeeded: needed })
          return needed
        } catch {
          return false
        }
      },
    }),
    {
      name: 'aical-auth-v2',
      partialize: (state) => ({
        token:   state.token,
        user:    state.user,
        company: state.company,
      }),
    }
  )
)

// Rehydrate token on load
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('aical-auth-v2')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.state?.token) {
        apiClient.setToken(parsed.state.token)
      }
    }
  } catch {}
}