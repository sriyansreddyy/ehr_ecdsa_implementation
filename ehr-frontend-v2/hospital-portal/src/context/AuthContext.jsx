import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { loginUser, createApiClient } from '../utils/api'
import { ensureUserKey, getUserKey } from '../utils/keyAuth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('ehr_hospital_user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('ehr_hospital_token') || null)
  const [userKey, setUserKey] = useState(() => {
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem('ehr_hospital_user')) } catch { return null }
    })()
    return stored?.username ? getUserKey(stored.username) : null
  })

  useEffect(() => {
    if (user?.username && !userKey) {
      setUserKey(ensureUserKey(user.username))
    }
  }, [user, userKey])

  const api = useCallback(
    () => createApiClient(token, user?.role),
    [token, user?.role]
  )

  const login = async (username, password) => {
    const data = await loginUser(username, password)
    const userData = data.data
    setToken(userData.token)
    setUser(userData.user)
    setUserKey(ensureUserKey(userData.user.username))
    localStorage.setItem('ehr_hospital_token', userData.token)
    localStorage.setItem('ehr_hospital_user', JSON.stringify(userData.user))
    return userData
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    setUserKey(null)
    localStorage.removeItem('ehr_hospital_token')
    localStorage.removeItem('ehr_hospital_user')
  }

  return (
    <AuthContext.Provider value={{ user, token, userKey, api, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
