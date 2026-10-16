import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_DIR } from './config.js'

const authFile = join(DATA_DIR, 'auth.json')
const sessionLifetime = 30 * 24 * 60 * 60 * 1000

type AuthState = {
  username: string
  salt: string
  passwordHash: string
  sessions: { tokenHash: string; expiresAt: number }[]
}

function readState(): AuthState | null {
  try { return JSON.parse(readFileSync(authFile, 'utf8')) as AuthState } catch { return null }
}

function saveState(state: AuthState) {
  writeFileSync(authFile, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

function hashToken(token: string) { return createHash('sha256').update(token).digest('hex') }

export function authConfigured() { return Boolean(readState()) }

export function createInitialAccount(username: unknown, password: unknown) {
  if (authConfigured()) throw new Error('账户已经设置')
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_.-]{2,40}$/u.test(username.trim())) throw new Error('用户名需为 2 到 40 个字母、数字或 ._-')
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new Error('密码长度需为 8 到 200 个字符')
  const salt = randomBytes(16).toString('hex')
  saveState({ username: username.trim(), salt, passwordHash: scryptSync(password, salt, 64).toString('hex'), sessions: [] })
}

export function login(username: unknown, password: unknown, remember: boolean) {
  const state = readState()
  if (!state || typeof username !== 'string' || typeof password !== 'string' || username !== state.username) return null
  const candidate = scryptSync(password, state.salt, 64)
  const stored = Buffer.from(state.passwordHash, 'hex')
  if (stored.length !== candidate.length || !timingSafeEqual(Uint8Array.from(stored), Uint8Array.from(candidate))) return null
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  state.sessions = state.sessions.filter(session => session.expiresAt > now)
  state.sessions.push({ tokenHash: hashToken(token), expiresAt: now + (remember ? sessionLifetime : 12 * 60 * 60 * 1000) })
  saveState(state)
  return { token, username: state.username }
}

export function updateAccount(token: unknown, currentPassword: unknown, username: unknown, newPassword: unknown) {
  const currentUser = authenticatedUser(token)
  const state = readState()
  if (!currentUser || !state || typeof currentPassword !== 'string') throw new Error('登录已失效，请重新登录')
  const candidate = scryptSync(currentPassword, state.salt, 64)
  const stored = Buffer.from(state.passwordHash, 'hex')
  if (stored.length !== candidate.length || !timingSafeEqual(Uint8Array.from(stored), Uint8Array.from(candidate))) throw new Error('当前密码不正确')
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_.-]{2,40}$/u.test(username.trim())) throw new Error('用户名需为 2 到 40 个字母、数字或 ._-')
  if (newPassword !== '' && (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200)) throw new Error('新密码长度需为 8 到 200 个字符')
  state.username = username.trim()
  if (newPassword) {
    state.salt = randomBytes(16).toString('hex')
    state.passwordHash = scryptSync(newPassword, state.salt, 64).toString('hex')
    const currentTokenHash = hashToken(token as string)
    state.sessions = state.sessions.filter(session => session.tokenHash === currentTokenHash)
  }
  saveState(state)
  return { username: state.username }
}

export function authenticatedUser(token: unknown): string | null {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) return null
  const state = readState()
  if (!state) return null
  const tokenHash = hashToken(token)
  const now = Date.now()
  const valid = state.sessions.find(session => session.expiresAt > now && timingSafeEqual(Uint8Array.from(Buffer.from(session.tokenHash)), Uint8Array.from(Buffer.from(tokenHash))))
  if (!valid) {
    const sessions = state.sessions.filter(session => session.expiresAt > now)
    if (sessions.length !== state.sessions.length) { state.sessions = sessions; saveState(state) }
    return null
  }
  return state.username
}

export function revokeSession(token: unknown) {
  if (typeof token !== 'string') return
  const state = readState()
  if (!state) return
  const tokenHash = hashToken(token)
  state.sessions = state.sessions.filter(session => session.tokenHash !== tokenHash)
  saveState(state)
}
