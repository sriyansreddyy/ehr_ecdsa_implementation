import axios from 'axios'

const BASE = 'http://localhost:3005'

export const patientApi = axios.create({ baseURL: BASE })

export function createPatientClient(token) {
  const client = axios.create({ baseURL: BASE })
  if (token) client.defaults.headers.common['Authorization'] = `Bearer ${token}`
  return client
}

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export const VISIT_STATUS_INFO = {
  OPEN:              { label: 'Open',              color: 'text-slate-600',   bg: 'bg-slate-100' },
  WITH_DOCTOR:       { label: 'With Doctor',       color: 'text-blue-700',    bg: 'bg-blue-100' },
  WITH_NURSE:        { label: 'With Nurse',        color: 'text-violet-700',  bg: 'bg-violet-100' },
  WITH_LAB:          { label: 'At Laboratory',     color: 'text-amber-700',   bg: 'bg-amber-100' },
  VISIT_FINALIZED:   { label: 'Visit Complete',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
  RECORD_FINALIZED:  { label: 'Record Finalized',  color: 'text-teal-700',    bg: 'bg-teal-100' },
  CLAIM_SUBMITTED:   { label: 'Claim Submitted',   color: 'text-orange-700',  bg: 'bg-orange-100' },
  CLAIM_UNDER_AUDIT: { label: 'Claim Under Audit', color: 'text-yellow-700',  bg: 'bg-yellow-100' },
  CLAIM_APPROVED:    { label: 'Claim Approved',    color: 'text-green-700',   bg: 'bg-green-100' },
  CLAIM_REJECTED:    { label: 'Claim Rejected',    color: 'text-red-700',     bg: 'bg-red-100' },
  DISCHARGED:        { label: 'Discharged',        color: 'text-gray-500',    bg: 'bg-gray-100' },
}
