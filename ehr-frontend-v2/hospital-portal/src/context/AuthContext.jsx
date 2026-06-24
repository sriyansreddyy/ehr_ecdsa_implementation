import { createContext, useContext, useState, useCallback } from 'react'
import { createApiClient } from '../utils/api'
import axios from 'axios'

const AuthContext = createContext(null)

const AUTH_BASES = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
]

export function AuthProvider({ children }) {
  // Session state — token and user kept only in React state (no localStorage)
  const [user,  setUser]  = useState(null)
  const [token, setToken] = useState(null)

  const api = useCallback(
    () => createApiClient(token, user?.role),
    [token, user?.role]
  )

  /**
   * loginStep1(username, password)
   * --------------------------------
   * Sends credentials to the backend.
   * On success, backend sends OTP to the actor's registered email.
   * Returns { maskedEmail } so the UI can show "Code sent to s***@..."
   * Does NOT issue a JWT yet.
   */
  const loginStep1 = async (username, password) => {
    for (const base of AUTH_BASES) {
      try {
        const res = await axios.post(`${base}/auth/login`, { username, password })
        if (res.data.success) {
          return { ...res.data.data, apiBase: base }
        }
      } catch (err) {
        if (err.response?.status === 401) {
          throw new Error(err.response.data.error || 'Invalid credentials')
        }
      }
    }
    throw new Error('Invalid credentials')
  }

  /**
   * loginStep2(username, otp)
   * --------------------------
   * Verifies the OTP. On success, backend issues a JWT.
   * Sets user + token in React state (never in localStorage).
   */
  const loginStep2 = async (username, otp) => {
    for (const base of AUTH_BASES) {
      try {
        const res = await axios.post(`${base}/auth/verify-otp`, { username, otp })
        if (res.data.success) {
          const { token: newToken, user: userData } = res.data.data
          setToken(newToken)
          setUser(userData)
          return userData
        }
      } catch (err) {
        if (err.response?.status === 401) {
          throw new Error(err.response.data.error || 'Invalid OTP')
        }
      }
    }
    throw new Error('OTP verification failed')
  }

  const logout = () => {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, api, loginStep1, loginStep2, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)