import axios from 'axios'

export const SOLICITUDES_UPDATED_EVENT = 'solicitudes:updated'
export const DASHBOARD_UPDATED_EVENT = 'dashboard:updated'

function notifySolicitudesUpdated() {
  window.dispatchEvent(new Event(SOLICITUDES_UPDATED_EVENT))
  notifyDashboardUpdated()
}

function notifyDashboardUpdated() {
  window.dispatchEvent(new Event(DASHBOARD_UPDATED_EVENT))
}

const BASE_URLS = [...new Set([
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  'http://localhost:4000/api',
  'http://127.0.0.1:4000/api'
].filter(Boolean).map((url) => url.replace(/\/+$/, '')))]

let activeBaseURL = BASE_URLS[0]

function getStoredUser() {
  try {
    const raw = localStorage.getItem('colegio_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function attachAuthHeaders(headers = {}) {
  const storedUser = getStoredUser()
  const authHeaders = { ...headers }

  if (!authHeaders.Authorization && storedUser?.accessToken) {
    authHeaders.Authorization = `Bearer ${storedUser.accessToken}`
  }
  if (!authHeaders['x-user-role'] && storedUser?.role) authHeaders['x-user-role'] = String(storedUser.role)
  if (!authHeaders['x-user-id'] && storedUser?.id) authHeaders['x-user-id'] = String(storedUser.id)

  return authHeaders
}

async function request(method, path, config = {}) {
  const candidates = [...new Set([activeBaseURL, ...BASE_URLS.filter((url) => url !== activeBaseURL)])]
  let lastError = null

  for (const baseURL of candidates) {
    try {
      const response = await axios.request({
        ...config,
        method,
        url: `${baseURL}${path.startsWith('/') ? path : `/${path}`}`,
        headers: attachAuthHeaders(config.headers || {})
      })
      activeBaseURL = baseURL
      return response
    } catch (err) {
      lastError = err
      const status = err.response?.status
      const isNetworkIssue = !err.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error') || err.message?.includes('ECONNREFUSED') || err.message?.includes('getaddrinfo')
      const isMissingRouteOnThisServer = [404, 405].includes(status)

      if (!isNetworkIssue && !isMissingRouteOnThisServer) {
        throw err
      }
    }
  }

  throw lastError || new Error('No se pudo conectar con el backend')
}

export async function fetchAlumnosPage(page = 1, limit = 8){
  const res = await request('get', '/alumnos', {
    params: { page, limit }
  })
  return res.data
}

export async function searchStudentsForRepresentativeAccount(query, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('get', '/auth/users/representative-students', {
    params: { q: query },
    headers
  })
  return res.data
}

export async function searchAlumnosForPreinscripcion(query) {
  const res = await request('get', '/alumnos/buscar-preinscripcion', {
    params: { q: query }
  })
  return res.data
}

export async function updateAlumno(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/alumnos/${id}`, { data, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deleteAlumnos(ids, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', '/alumnos/bulk', { data: { ids }, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function fetchRepresentantes(){
  const res = await request('get', '/representantes')
  return res.data
}

export async function updateRepresentante(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/representantes/${id}`, { data, headers })
  return res.data
}

export async function deleteRepresentantes(ids, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', '/representantes/bulk', { data: { ids }, headers })
  return res.data
}

export async function fetchPreinscripciones(){
  const res = await request('get', '/preinscripciones')
  return res.data
}

export async function updatePreinscripcion(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/preinscripciones/${id}`, { data, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deletePreinscripcion(id, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', `/preinscripciones/${id}`, { headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deletePreinscripciones(ids, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', '/preinscripciones/bulk', { data: { ids }, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function fetchCatalogos() {
  const res = await request('get', '/preinscripciones/catalogos')
  return res.data
}

function buildAuthHeaders(role, userId, accessToken) {
  const headers = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)
  return headers
}

export async function fetchDashboardSummary(role, userId, accessToken){
  const res = await request('get', '/dashboard/summary', {
    headers: buildAuthHeaders(role, userId, accessToken)
  })
  return res.data
}

export async function createSolicitud(data) {
  const res = await request('post', '/solicitudes', { data })
  notifySolicitudesUpdated()
  return res.data
}

export async function createAdminInscripcion(data, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  if (data instanceof FormData) {
    const res = await request('post', '/solicitudes/admin', { data, headers })
    notifySolicitudesUpdated()
    return res.data
  }

  const res = await request('post', '/solicitudes/admin', { data, headers })
  notifySolicitudesUpdated()
  return res.data
}

export async function createExistingStudentPreinscripcion(data, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)
  const res = await request('post', '/solicitudes/preinscripcion', { data, headers })
  notifySolicitudesUpdated()
  return res.data
}

export async function createRepresentativePreinscripcion(data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('post', '/solicitudes/preinscripcion', { data, headers })
  notifySolicitudesUpdated()
  return res.data
}

export async function fetchRepresentativePreinscriptionStudents(cedula, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('get', '/solicitudes/preinscripcion/alumnos', {
    params: { cedula },
    headers
  })
  return res.data
}

export async function fetchUsers(role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('get', '/auth/users', { headers })
  return res.data
}

export async function createUserAccount(data, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('post', '/auth/users', { data, headers })
  return res.data
}

export async function updateUserAccount(id, data, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('put', `/auth/users/${id}`, { data, headers })
  return res.data
}

export async function removeUserRole(id, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('delete', `/auth/users/${id}/role`, { headers })
  return res.data
}

export async function deleteUserAccount(id, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('delete', `/auth/users/${id}`, { headers })
  return res.data
}

export async function fetchRoles(role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('get', '/roles', { headers })
  return res.data
}

export async function createRole(data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('post', '/roles', { data, headers })
  return res.data
}

export async function updateRole(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/roles/${id}`, { data, headers })
  return res.data
}

export async function deleteRole(id, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', `/roles/${id}`, { headers })
  return res.data
}

export async function fetchModulos(role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('get', '/modulos', { headers })
  return res.data
}

export async function fetchGrados(role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('get', '/grados', { headers })
  return res.data
}

export async function fetchSecciones(role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('get', '/grados/secciones', { headers })
  return res.data
}

export async function createGrado(data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('post', '/grados', { data, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function updateGrado(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/grados/${id}`, { data, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deleteGrado(id, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', `/grados/${id}`, { headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deleteGrados(ids, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', '/grados/bulk', { data: { ids }, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function createSeccion(data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('post', '/grados/secciones', { data, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function updateSeccion(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/grados/secciones/${id}`, { data, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deleteSeccion(id, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', `/grados/secciones/${id}`, { headers })
  notifyDashboardUpdated()
  return res.data
}

export async function deleteSecciones(ids, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', '/grados/secciones/bulk', { data: { ids }, headers })
  notifyDashboardUpdated()
  return res.data
}

export async function fetchRoleModuleAccess(role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('get', '/acceso', { headers })
  return res.data
}

export async function saveRoleModuleAccess(data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('post', '/acceso', { data, headers })
  return res.data
}

export async function fetchDocumentos() {
  const res = await request('get', '/solicitudes/documentos')
  return res.data
}

export async function fetchSolicitudes() {
  const res = await request('get', '/solicitudes')
  return res.data
}

export async function updateSolicitud(id, data, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('put', `/solicitudes/${id}`, { data, headers })
  notifySolicitudesUpdated()
  return res.data
}

export async function deleteSolicitudes(ids, role, userId) {
  const headers = buildAuthHeaders(role, userId)
  const res = await request('delete', '/solicitudes/bulk', { data: { ids }, headers })
  notifySolicitudesUpdated()
  return res.data
}

export async function fetchSolicitudById(id) {
  const res = await request('get', `/solicitudes/${id}`)
  return res.data
}

export async function fetchDocumentCatalogs() {
  const res = await request('get', '/solicitudes/documentos/catalogos')
  return res.data
}

export async function approveSolicitud(id, data, role, userId) {
  const headers = {}
  if (role) headers['x-user-role'] = role
  if (userId) headers['x-user-id'] = String(userId)

  const res = await request('put', `/solicitudes/${id}/approve`, { data, headers })
  notifySolicitudesUpdated()
  return res.data
}

export async function submitInscripcion(id, data, role, userId) {
  const headers = {
    'x-user-role': role
  }
  if (userId) {
    headers['x-user-id'] = String(userId)
  }

  const res = await request('put', `/solicitudes/${id}/inscripcion`, {
    data,
    headers
  })
  notifySolicitudesUpdated()
  return res.data
}

export async function loginUser(credentials) {
  try {
    const res = await request('post', '/auth/login', { data: credentials })
    return res.data
  } catch (err) {
    if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
      throw { response: { data: { error: 'No hay conexión con el backend. Inicia el servidor en http://localhost:4000 o verifica que el backend esté activo.' } } }
    }
    throw err
  }
}

export async function fetchCurrentUserPermissions(accessToken) {
  const res = await request('get', '/auth/permissions', {
    headers: buildAuthHeaders(null, null, accessToken)
  })
  return res.data
}

export async function logoutUser() {
  const res = await request('post', '/auth/logout')
  return res.data
}
