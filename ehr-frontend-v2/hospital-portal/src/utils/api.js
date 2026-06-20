import axios from 'axios'

const ROLE_APIS = {
  receptionist:     'http://localhost:3001',
  admin:            'http://localhost:3001',
  doctor:           'http://localhost:3002',
  nurse:            'http://localhost:3003',
  pharmacist:       'http://localhost:3003',
  medrecordofficer: 'http://localhost:3003',
}

export function getApiBase(role) {
  return ROLE_APIS[role] || 'http://localhost:3001'
}

export function createApiClient(token, role) {
  const base = getApiBase(role)
  const client = axios.create({ baseURL: base })
  if (token) client.defaults.headers.common['Authorization'] = `Bearer ${token}`
  return client
}

export async function loginUser(username, password) {
  const apis = [
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ]
  for (const base of apis) {
    try {
      const res = await axios.post(`${base}/auth/login`, { username, password })
      if (res.data.success) return { ...res.data, apiBase: base }
    } catch {}
  }
  throw new Error('Invalid credentials')
}

export const STATUS_COLORS = {
  OPEN:              'bg-slate-100 text-slate-700',
  WITH_DOCTOR:       'bg-blue-100 text-blue-700',
  WITH_NURSE:        'bg-violet-100 text-violet-700',
  WITH_LAB:          'bg-amber-100 text-amber-700',
  VISIT_FINALIZED:   'bg-emerald-100 text-emerald-700',
  RECORD_FINALIZED:  'bg-teal-100 text-teal-700',
  CLAIM_SUBMITTED:   'bg-orange-100 text-orange-700',
  CLAIM_UNDER_AUDIT: 'bg-yellow-100 text-yellow-700',
  CLAIM_APPROVED:    'bg-green-100 text-green-700',
  CLAIM_REJECTED:    'bg-red-100 text-red-700',
  DISCHARGED:        'bg-gray-100 text-gray-500',
}

export const STATUS_LABELS = {
  OPEN:              'Open',
  WITH_DOCTOR:       'With Doctor',
  WITH_NURSE:        'With Nurse',
  WITH_LAB:          'With Lab',
  VISIT_FINALIZED:   'Visit Finalized',
  RECORD_FINALIZED:  'Record Finalized',
  CLAIM_SUBMITTED:   'Claim Submitted',
  CLAIM_UNDER_AUDIT: 'Under Audit',
  CLAIM_APPROVED:    'Claim Approved',
  CLAIM_REJECTED:    'Claim Rejected',
  DISCHARGED:        'Discharged',
}
