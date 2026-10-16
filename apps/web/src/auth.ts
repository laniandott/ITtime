const TOKEN_KEY = 'ittime_auth_token'
const SESSION_KEY = 'ittime_auth_session'

export function getAuthToken(): string {
  if (typeof localStorage === 'undefined') return ''
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(SESSION_KEY) || '' } catch { return '' }
}

export function setAuthToken(token: string, remember: boolean) {
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(SESSION_KEY)
    if (token) (remember ? localStorage : sessionStorage).setItem(remember ? TOKEN_KEY : SESSION_KEY, token)
  } catch { /* Storage may be unavailable in restricted WebViews. */ }
}

export function clearAuthToken() { setAuthToken('', false) }

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
