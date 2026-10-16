import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'ittime-auth-'))
process.env.DATA_DIR = join(root, 'data')
const auth = await import('../src/auth.js')

test.after(() => rmSync(root, { recursive: true, force: true }))

test('initial account setup stores password hashes and issues revocable sessions', () => {
  assert.equal(auth.authConfigured(), false)
  assert.throws(() => auth.createInitialAccount('aa', 'short'), /密码长度/)
  auth.createInitialAccount('owner', 'correct horse battery staple')
  assert.equal(auth.authConfigured(), true)
  const stored = JSON.parse(readFileSync(join(root, 'data', 'auth.json'), 'utf8'))
  assert.notEqual(stored.passwordHash, 'correct horse battery staple')
  assert.ok(stored.salt)
  assert.throws(() => auth.createInitialAccount('second', 'correct horse battery staple'), /账户已经设置/)
  assert.equal(auth.login('owner', 'wrong password', true), null)
  const session = auth.login('owner', 'correct horse battery staple', true)
  const secondSession = auth.login('owner', 'correct horse battery staple', false)
  assert.ok(session)
  assert.ok(secondSession)
  assert.equal(auth.authenticatedUser(session.token), 'owner')
  assert.throws(() => auth.updateAccount(session.token, 'wrong password', 'new-owner', 'new secure password'), /当前密码/)
  assert.deepEqual(auth.updateAccount(session.token, 'correct horse battery staple', 'new-owner', 'new secure password'), { username: 'new-owner' })
  assert.equal(auth.authenticatedUser(session.token), 'new-owner')
  assert.equal(auth.authenticatedUser(secondSession.token), null)
  assert.equal(auth.login('owner', 'correct horse battery staple', true), null)
  assert.ok(auth.login('new-owner', 'new secure password', true))
  auth.revokeSession(session.token)
  assert.equal(auth.authenticatedUser(session.token), null)
})
