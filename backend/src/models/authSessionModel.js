const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const STORAGE_DIRECTORY = path.resolve(__dirname, '..', '..', 'storage')
const STORAGE_FILE = path.join(STORAGE_DIRECTORY, 'auth-sessions.json')
const sessions = new Map()
let loadPromise = null
let writeQueue = Promise.resolve()

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function serializeMutation(operation) {
  const result = writeQueue.then(operation, operation)
  writeQueue = result.catch(() => {})
  return result
}

async function readSessions() {
  try {
    const contents = await fs.readFile(STORAGE_FILE, 'utf8')
    const store = JSON.parse(contents)
    if (store.version !== 1 || !store.sessions || typeof store.sessions !== 'object') {
      throw new Error('El archivo de sesiones tiene un formato inválido.')
    }

    for (const [tokenHash, session] of Object.entries(store.sessions)) {
      if (!/^[a-f0-9]{64}$/i.test(tokenHash) ||
          !Number.isSafeInteger(Number(session.userId)) ||
          Number(session.userId) <= 0 ||
          !Number.isSafeInteger(Number(session.expiresAt))) {
        throw new Error('El archivo de sesiones contiene una sesión inválida.')
      }
      sessions.set(tokenHash, {
        userId: Number(session.userId),
        expiresAt: Number(session.expiresAt)
      })
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = readSessions().catch((error) => {
      loadPromise = null
      throw error
    })
  }
  await loadPromise
}

async function writeSessions() {
  await fs.mkdir(STORAGE_DIRECTORY, { recursive: true, mode: 0o700 })
  const temporaryPath = `${STORAGE_FILE}.${process.pid}.${Date.now()}.tmp`
  const serialized = JSON.stringify({
    version: 1,
    sessions: Object.fromEntries(sessions)
  })
  await fs.writeFile(temporaryPath, serialized, { mode: 0o600 })
  try {
    await fs.rename(temporaryPath, STORAGE_FILE)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true })
    throw error
  }
}

function removeExpiredSessions(now = Date.now()) {
  let changed = false
  for (const [tokenHash, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(tokenHash)
      changed = true
    }
  }
  return changed
}

async function createSession(userId) {
  const normalizedUserId = Number(userId)
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw new Error('No se puede crear una sesión para un usuario no válido.')
  }

  return serializeMutation(async () => {
    await ensureLoaded()
    removeExpiredSessions()
    const token = crypto.randomBytes(32).toString('hex')
    sessions.set(hashToken(token), {
      userId: normalizedUserId,
      expiresAt: Date.now() + SESSION_TTL_MS
    })
    await writeSessions()
    return token
  })
}

async function getSessionUserId(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return null

  return serializeMutation(async () => {
    await ensureLoaded()
    const now = Date.now()
    const changed = removeExpiredSessions(now)
    const session = sessions.get(hashToken(token))
    if (changed) await writeSessions()
    return session && session.expiresAt > now ? session.userId : null
  })
}

async function revokeSession(token) {
  if (!/^[a-f0-9]{64}$/i.test(String(token || ''))) return

  return serializeMutation(async () => {
    await ensureLoaded()
    if (sessions.delete(hashToken(token))) await writeSessions()
  })
}

async function revokeUserSessions(userId) {
  const normalizedUserId = Number(userId)
  return serializeMutation(async () => {
    await ensureLoaded()
    let changed = false
    for (const [tokenHash, session] of sessions) {
      if (session.userId === normalizedUserId) {
        sessions.delete(tokenHash)
        changed = true
      }
    }
    if (changed) await writeSessions()
  })
}

module.exports = { createSession, getSessionUserId, revokeSession, revokeUserSessions }
