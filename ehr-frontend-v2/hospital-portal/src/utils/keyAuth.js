const KEY_PREFIX = 'ehr_hospital_key:'

function getStorageKey(userId) {
  return `${KEY_PREFIX}${userId}`
}

export function getUserKey(userId) {
  if (!userId) return null
  return localStorage.getItem(getStorageKey(userId))
}

export function ensureUserKey(userId) {
  if (!userId) return null
  const existing = getUserKey(userId)
  if (existing) return existing

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  localStorage.setItem(getStorageKey(userId), key)
  return key
}

export function maskKey(key) {
  if (!key) return '********'
  return `******** (${key.length} chars)`
}

export function matchesKey(input, key) {
  if (!input || !key) return false
  return input.trim() === key
}
