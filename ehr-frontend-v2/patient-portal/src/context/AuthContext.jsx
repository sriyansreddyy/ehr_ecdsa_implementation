import { createContext, useContext, useState, useCallback } from 'react'
import { createPatientClient } from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [patient, setPatient] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ehr_patient_user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('ehr_patient_token') || null)

  const api = useCallback(() => createPatientClient(token), [token])

  // Step 1: Send password, receive OTP prompt
  const loginStep1 = async (patientId, password) => {
    const client = createPatientClient(null)
    const res = await client.post('/auth/login', { patientId, password })
    return res.data.data // { otpSent: true, maskedEmail }
  }

  // Step 2: Verify OTP, receive JWT
  const loginStep2 = async (patientId, otp) => {
    const client = createPatientClient(null)
    const res = await client.post('/auth/verify-otp', { patientId, otp })
    const { token: t } = res.data.data
    setToken(t)
    setPatient({ patientId })
    localStorage.setItem('ehr_patient_token', t)
    localStorage.setItem('ehr_patient_user', JSON.stringify({ patientId }))
    return res.data.data
  }

  // Legacy single-step for backward compatibility (now calls loginStep1 + loginStep2)
  const login = async (patientId, password) => {
    const step1Result = await loginStep1(patientId, password)
    // This won't auto-continue; frontend must handle OTP step
    return step1Result
  }

  const register = async (patientId, password, email, phone) => {
    const client = createPatientClient(null)
    const res = await client.post('/auth/register', { patientId, password, email, phone })
    const { token: t, patient: p } = res.data.data
    setToken(t)
    setPatient({ ...p, patientId })
    localStorage.setItem('ehr_patient_token', t)
    localStorage.setItem('ehr_patient_user', JSON.stringify({ ...p, patientId }))
    return res.data.data
  }

  const logout = () => {
    setToken(null)
    setPatient(null)
    localStorage.removeItem('ehr_patient_token')
    localStorage.removeItem('ehr_patient_user')
  }

  return (
    <AuthContext.Provider value={{ patient, token, api, loginStep1, loginStep2, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
