import { createContext, useContext, useState, useCallback } from 'react'
import { createApiClient } from '../utils/api'

const AuthContext = createContext(null)

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token') || null)
  
  // Expose the private key to the dashboard so KeyGateModal works
  const [privateKey, setPrivateKey] = useState(sessionStorage.getItem('actorPrivateKey') || null)
  
  const [user, setUser] = useState(() => {
    const storedToken = localStorage.getItem('token');
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
    setToken(null)
    setUser(null)
    setPrivateKey(null)
    localStorage.removeItem('token')
    sessionStorage.removeItem('actorPrivateKey')
  }

  return (
    <AuthContext.Provider value={{ user, token, privateKey, api, loginSuccess, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)