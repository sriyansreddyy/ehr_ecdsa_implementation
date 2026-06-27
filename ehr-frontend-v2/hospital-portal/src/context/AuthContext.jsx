import { createContext, useContext, useState, useCallback } from 'react'
import { createApiClient } from '../utils/api'
import { clearUserKey } from '../utils/keyAuth'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Use sessionStorage to prevent unwanted auto-login across restarts
  const [token, setToken] = useState(sessionStorage.getItem('token') || null)
  
  // Expose the private key to the dashboard so KeyGateModal works
  const [privateKey, setPrivateKey] = useState(sessionStorage.getItem('actorPrivateKey') || null)
  
  const [user, setUser] = useState(() => {
    const storedToken = sessionStorage.getItem('token');
    if (storedToken) {
      const decoded = parseJwt(storedToken);
      if (decoded) {
        return { 
          username: decoded.userId, 
          role: decoded.role, 
          mspId: decoded.mspId, 
          peer: decoded.peer 
        };
      }
    }
    return null;
  })

  const api = useCallback(
    () => createApiClient(token, user?.role),
    [token, user?.role]
  )

  const loginSuccess = (userData, authToken, extractedKey) => {
    setToken(authToken)
    setUser(userData)
    setPrivateKey(extractedKey)
  }

  // Fully clears the session
    const logout = () => {
    // Clear the specific user's key if we know who is logged in
    if (user && user.username) {
      clearUserKey(user.username)
    }

    setToken(null)
    setUser(null)
    setPrivateKey(null)
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('actorPrivateKey')
    localStorage.removeItem('token') 

    // Brute-force cleanup to ensure no stray keys are left behind
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('ehr_hospital_key:')) sessionStorage.removeItem(key)
    })
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      privateKey, 
      userKey: privateKey, /* <-- THIS IS THE FIX */
      api, 
      loginSuccess, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)