const KEY_PREFIX = 'ehr_hospital_key:'

function getStorageKey(userId) {
  return `${KEY_PREFIX}${userId}`
}

export function getUserKey(userId) {
  if (!userId) return null
  // Check sessionStorage first (our secure, session-only storage), fallback to localStorage just in case
  return sessionStorage.getItem(getStorageKey(userId)) || localStorage.getItem(getStorageKey(userId))
}

export function setUserKey(userId, key) {
  if (!userId || !key) return
  // Save to sessionStorage so it dies when the tab closes, preventing auto-login bugs
  sessionStorage.setItem(getStorageKey(userId), key)
}

export function clearUserKey(userId) {
  if (!userId) return
  sessionStorage.removeItem(getStorageKey(userId))
  localStorage.removeItem(getStorageKey(userId))
}

export function ensureUserKey(userId) {
  if (!userId) return null
  const existing = getUserKey(userId)
  if (existing) return existing

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  setUserKey(userId, key)
  return key
}

export function maskKey(key) {
  if (!key) return 'Not available'
  return `******** (${key.length} chars)`
}

export function matchesKey(input, key) {
  if (!input || !key) return false
  // Strip all whitespace and newlines for a robust comparison
  const normalize = (s) => s.replace(/\s+/g, '')
  return normalize(input) === normalize(key)
}