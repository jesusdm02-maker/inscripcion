import React, { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createUserAccount, fetchSolicitudes, SOLICITUDES_UPDATED_EVENT } from '../services/api'
import CircularActionButton from './CircularActionButton'
import { canOpenModule, hasPermission } from '../utils/permissions'
import schoolLogo from '../../../Logo/logo1.jpeg'

const emptyUserForm = {
  nombre: '',
  apellido: '',
  correo: '',
  password: '',
  role: '',
  telefono: '',
  cedula: '',
  calle: '',
  avenida: '',
  municipio: ''
}

const sidebarIcons = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  application: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  students: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  representatives: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  requests: <><path d="M8 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="m8 13 2.5 2.5L16 10" /></>,
  grades: <><path d="m2 10 10-5 10 5-10 5-10-5Z" /><path d="M6 12v5c3 3 9 3 12 0v-5M22 10v6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z" /></>,
  userSettings: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20v-1a6 6 0 0 1 11-3.2M19 14.5l.6 1.2 1.3.2v1.5l-1.3.2-.6 1.2-1.3-.5-1.1.7-1.1-.7-1.3.5-.6-1.2-1.3-.2v-1.5l1.3-.2.6-1.2 1.3.5 1.1-.7 1.1.7 1.3-.5Z" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  modules: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
}

function SidebarIcon({ name }) {
  return (
    <svg className="sidebar-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {sidebarIcons[name]}
    </svg>
  )
}

export default function Sidebar(){
  const { user } = useAuth()
  const location = useLocation()
  const [configOpen, setConfigOpen] = useState(false)
  const [alumnosOpen, setAlumnosOpen] = useState(() =>
    String(user?.role || user?.rol || '').trim().toLocaleLowerCase('es') === 'representante'
  )
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [newUserForm, setNewUserForm] = useState(emptyUserForm)
  const [creatingUser, setCreatingUser] = useState(false)
  const [createUserError, setCreateUserError] = useState('')
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const isRepresentative = String(user?.role || user?.rol || '').trim().toLocaleLowerCase('es') === 'representante'
  const canSeePanel = !isRepresentative && canOpenModule(user, 'Panel')
  const canSeePreinscripcion = isRepresentative
    ? hasPermission(user, 'Preinscripciones', 'Crear')
    : canOpenModule(user, 'Preinscripciones')
  const canSeeAlumnos = !isRepresentative && canOpenModule(user, 'Alumnos')
  const canSeeNuevoIngreso = isRepresentative
    ? hasPermission(user, 'Nuevo ingreso', 'Crear')
    : hasPermission(user, 'Preinscripciones', 'Crear') &&
      hasPermission(user, 'Alumnos', 'Crear') &&
      hasPermission(user, 'Representantes', 'Crear')
  const canSeeRepresentantes = !isRepresentative && canOpenModule(user, 'Representantes')
  const canSeeSolicitudes = !isRepresentative && canOpenModule(user, 'Solicitudes')
  const canSeeUsuarios = !isRepresentative && canOpenModule(user, 'Usuarios')
  const canSeeRoles = !isRepresentative && canOpenModule(user, 'Roles')
  const canSeeModulos = !isRepresentative && canOpenModule(user, 'Modulos')
  const canSeeConfiguracion = canSeeUsuarios || canSeeRoles || canSeeModulos
  const canSeeGradosSecciones = !isRepresentative && canOpenModule(user, 'Grados y Secciones')

  useEffect(() => {
    if (isRepresentative) setAlumnosOpen(true)
  }, [isRepresentative])

  useEffect(() => {
    if (!canSeeSolicitudes) {
      setPendingRequestCount(0)
      return undefined
    }

    let active = true
    let requestInProgress = false
    const refreshPendingRequestCount = async () => {
      if (!active || requestInProgress || document.visibilityState !== 'visible') return
      requestInProgress = true
      try {
        const solicitudes = await fetchSolicitudes()
        if (!Array.isArray(solicitudes)) {
          throw new TypeError('La respuesta de solicitudes no es una lista.')
        }
        if (active) {
          setPendingRequestCount(solicitudes.filter((solicitud) => solicitud.estado === 'Pendiente').length)
        }
      } catch (error) {
        if (active) console.error('No se pudo actualizar el contador de solicitudes pendientes:', error)
      } finally {
        requestInProgress = false
      }
    }

    refreshPendingRequestCount()
    const intervalId = window.setInterval(refreshPendingRequestCount, 5000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshPendingRequestCount()
    }
    window.addEventListener('focus', refreshPendingRequestCount)
    window.addEventListener(SOLICITUDES_UPDATED_EVENT, refreshPendingRequestCount)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshPendingRequestCount)
      window.removeEventListener(SOLICITUDES_UPDATED_EVENT, refreshPendingRequestCount)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [canSeeSolicitudes, location.pathname])

  const handleAlumnosToggle = () => {
    setAlumnosOpen(prev => !prev)
  }

  const handleConfigToggle = () => {
    setConfigOpen(prev => !prev)
  }

  const handleCreateUserChange = (event) => {
    const { name, value } = event.target
    setNewUserForm(prev => ({ ...prev, [name]: value }))
  }

  const handleCreateUserSubmit = async (event) => {
    event.preventDefault()
    setCreatingUser(true)
    setCreateUserError('')

    try {
      await createUserAccount(newUserForm, user?.role, user?.id)
      setNewUserForm(emptyUserForm)
      setShowCreateUserModal(false)
    } catch (err) {
      setCreateUserError(err.response?.data?.error || 'No se pudo crear el usuario')
    } finally {
      setCreatingUser(false)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img className="sidebar-logo" src={schoolLogo} alt="Logo del Colegio Batalla de Araure" />
        </div>
      </div>
      {user && (
        <>
          <nav className="sidebar-nav" aria-label="Navegación principal">
            {canSeePanel && (
              <section className="sidebar-section">
                <span className="sidebar-section-label">INICIO</span>
                <NavLink end to="/" title="Panel" className={({ isActive }) => isActive ? 'active' : ''}>
                  <SidebarIcon name="home" />
                  <span className="sidebar-label">Panel</span>
                </NavLink>
              </section>
            )}
            {(canSeePreinscripcion || canSeeAlumnos || canSeeNuevoIngreso || canSeeRepresentantes || canSeeSolicitudes || canSeeGradosSecciones) && (
              <section className="sidebar-section">
                <span className="sidebar-section-label">{isRepresentative ? 'ADMISIÓN' : 'GESTIÓN ACADÉMICA'}</span>
                {(canSeeAlumnos || canSeePreinscripcion || canSeeNuevoIngreso) && (
                  <div className="sidebar-group">
                    <div className="sidebar-group-heading">
                      <button
                        type="button"
                        title="Alumnos"
                        aria-label="Alumnos"
                        aria-expanded={alumnosOpen}
                        aria-controls="sidebar-alumnos-submenu"
                        className={`sidebar-config-toggle sidebar-group-toggle${alumnosOpen ? ' open' : ''}${location.pathname.startsWith('/alumnos') || location.pathname.startsWith('/preinscripciones') ? ' active' : ''}`}
                        onClick={handleAlumnosToggle}
                      >
                        <SidebarIcon name="students" />
                        <span className="sidebar-label sidebar-config-label">{isRepresentative ? 'Admisión' : 'Alumnos'}</span>
                        <SidebarIcon name="chevron" />
                      </button>
                    </div>
                    <div id="sidebar-alumnos-submenu" className={`sidebar-submenu ${alumnosOpen ? 'open' : ''}`} aria-hidden={!alumnosOpen} inert={alumnosOpen ? undefined : ''}>
                      {canSeeNuevoIngreso && (
                        <NavLink to="/alumnos/nuevo-ingreso" title="Nuevo ingreso" className={({ isActive }) => isActive ? 'active' : ''}>
                          <SidebarIcon name="application" />
                          <span className="sidebar-label">Nuevo ingreso</span>
                        </NavLink>
                      )}
                      {canSeePreinscripcion && (
                        <NavLink to="/alumnos/preinscripciones" title="Preinscripciones" className={({ isActive }) => isActive ? 'active' : ''}>
                          <SidebarIcon name="application" />
                          <span className="sidebar-label">Preinscripciones</span>
                        </NavLink>
                      )}
                      {canSeeAlumnos && (
                        <NavLink to="/alumnos/registrados" title="Alumnos registrados" className={({ isActive }) => isActive ? 'active' : ''}>
                          <SidebarIcon name="students" />
                          <span className="sidebar-label">Alumnos registrados</span>
                        </NavLink>
                      )}
                    </div>
                  </div>
                )}
                {canSeeRepresentantes && (
                  <NavLink to="/representantes" title="Representantes" className={({ isActive }) => isActive ? 'active' : ''}>
                    <SidebarIcon name="representatives" />
                    <span className="sidebar-label">Representantes</span>
                  </NavLink>
                )}
                {canSeeSolicitudes && (
                  <NavLink
                    to="/solicitudes"
                    title={pendingRequestCount > 0 ? `Solicitudes: ${pendingRequestCount} pendientes` : 'Solicitudes'}
                    className={({ isActive }) => isActive ? 'active' : ''}
                  >
                    <SidebarIcon name="requests" />
                    <span className="sidebar-label">Solicitudes</span>
                    {pendingRequestCount > 0 && (
                      <span className="sidebar-pending-badge" aria-label={`${pendingRequestCount} solicitudes pendientes`} role="status">
                        {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                      </span>
                    )}
                  </NavLink>
                )}
                {canSeeGradosSecciones && (
                  <NavLink to="/grados" title="Grados y Secciones" className={({ isActive }) => isActive ? 'active' : ''}>
                    <SidebarIcon name="grades" />
                    <span className="sidebar-label">Grados y Secciones</span>
                  </NavLink>
                )}
              </section>
            )}
            {canSeeConfiguracion && (
              <section className="sidebar-section">
                <span className="sidebar-section-label">SISTEMA</span>
                <div className="sidebar-group">
                  <div className="sidebar-group-heading">
                    <button
                      type="button"
                      title="Configuración"
                      aria-label="Configuración"
                      aria-expanded={configOpen}
                      aria-controls="sidebar-configuration-submenu"
                      className={`sidebar-config-toggle sidebar-group-toggle${configOpen ? ' open' : ''}${location.pathname.startsWith('/configuracion/') ? ' active' : ''}`}
                      onClick={handleConfigToggle}
                    >
                      <SidebarIcon name="settings" />
                      <span className="sidebar-label sidebar-config-label">Configuración</span>
                      <SidebarIcon name="chevron" />
                    </button>
                  </div>
                  <div id="sidebar-configuration-submenu" className={`sidebar-submenu ${configOpen ? 'open' : ''}`} aria-hidden={!configOpen} inert={configOpen ? undefined : ''}>
                    {canSeeUsuarios && (
                      <NavLink to="/configuracion/usuarios" title="Usuarios" className={({ isActive }) => isActive ? 'active' : ''}>
                        <SidebarIcon name="userSettings" />
                        <span className="sidebar-label">Usuarios</span>
                      </NavLink>
                    )}
                    {canSeeRoles && (
                      <NavLink to="/configuracion/roles" title="Roles" className={({ isActive }) => isActive ? 'active' : ''}>
                        <SidebarIcon name="shield" />
                        <span className="sidebar-label">Roles</span>
                      </NavLink>
                    )}
                    {canSeeModulos && (
                      <NavLink to="/configuracion/modulos" title="Módulos" className={({ isActive }) => isActive ? 'active' : ''}>
                        <SidebarIcon name="modules" />
                        <span className="sidebar-label">Módulos</span>
                      </NavLink>
                    )}
                  </div>
                </div>
              </section>
            )}
          </nav>
          <div className="sidebar-footer">
            <span className="sidebar-footer-note">Sistema de preinscripción</span>
          </div>
        </>
      )}

      {hasPermission(user, 'Usuarios', 'Crear') && showCreateUserModal && (
        <div className="user-create-modal-overlay" role="dialog" aria-modal="true" aria-label="Crear usuario">
          <div className="user-create-modal-card management-form-modal">
            <div className="user-create-modal-header management-form-modal-header">
              <div>
                <span className="management-eyebrow">GESTIÓN DE CUENTAS</span>
                <h3>Crear usuario</h3>
                <p>Completa la información para dar acceso al sistema.</p>
              </div>
              <CircularActionButton action="exit" label="Cerrar formulario" title="Cerrar formulario" onClick={() => setShowCreateUserModal(false)} />
            </div>

            <form onSubmit={handleCreateUserSubmit} className="user-create-form user-account-form">
              <div className="user-create-row user-create-address-row">
                <label>
                  Nombre
                  <input name="nombre" value={newUserForm.nombre} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe el nombre del usuario" required />
                </label>
                <label>
                  Apellido
                  <input name="apellido" value={newUserForm.apellido} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe el apellido del usuario" required />
                </label>
              </div>

              <div className="user-create-row">
                <label>
                  Correo
                  <input type="email" name="correo" value={newUserForm.correo} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe el correo electrónico" required />
                </label>
                <label>
                  Contraseña
                  <input type="password" name="password" value={newUserForm.password} onChange={handleCreateUserChange} minLength={4} maxLength={255} placeholder="Escribe la contraseña de acceso" required />
                </label>
              </div>

              <div className="user-create-row">
                <label>
                  Teléfono
                  <input type="tel" name="telefono" value={newUserForm.telefono} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe el teléfono del usuario" required />
                </label>
                <label>
                  Cédula
                  <input name="cedula" value={newUserForm.cedula} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe la cédula del usuario" required />
                </label>
              </div>

              <div className="user-create-row">
                <label>
                  Calle
                  <input name="calle" value={newUserForm.calle} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe la calle de residencia" />
                </label>
                <label>
                  Avenida
                  <input name="avenida" value={newUserForm.avenida} onChange={handleCreateUserChange} maxLength={50} placeholder="Escribe la avenida de residencia" />
                </label>
                <label>
                  Municipio
                  <input name="municipio" value={newUserForm.municipio} onChange={handleCreateUserChange} maxLength={100} placeholder="Escribe el municipio de residencia" />
                </label>
              </div>

              {createUserError && <p className="form-error">{createUserError}</p>}

              <div className="user-create-actions management-modal-actions">
                <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={() => setShowCreateUserModal(false)} disabled={creatingUser} />
                <CircularActionButton action="create" type="submit" label={creatingUser ? 'Creando usuario' : 'Crear usuario'} title={creatingUser ? 'Creando usuario' : 'Crear usuario'} disabled={creatingUser} />
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}
