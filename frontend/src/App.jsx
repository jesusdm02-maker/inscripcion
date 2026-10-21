import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import DashboardPage from './pages/DashboardPage'
import AlumnosPage from './pages/AlumnosPage'
import PreinscripcionPage from './pages/PreinscripcionPage'
import RepresentantesPage from './pages/RepresentantesPage'
import PreinscripcionesPage from './pages/PreinscripcionesPage'
import SolicitudesPage from './pages/SolicitudesPage'
import UsuariosPage from './pages/UsuariosPage'
import RolesPage from './pages/RolesPage'
import ModulosPage from './pages/ModulosPage'
import GradosPage from './pages/GradosPage'
import LoginPage from './pages/LoginPage'
import { useAuth } from './context/AuthContext'
import { canOpenModule } from './utils/permissions'
function PrivateRoute({ children }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isRepresentative = String(user?.role || user?.rol || '').trim().toLocaleLowerCase('es') === 'representante'
  const representativeRoutes = ['/alumnos/nuevo-ingreso', '/alumnos/preinscripciones']
  if (isRepresentative && !representativeRoutes.includes(location.pathname)) {
    return <Navigate to="/alumnos/nuevo-ingreso" replace />
  }

  const routeModuleMap = {
    '/': 'Panel',
    '/alumnos': 'Alumnos registrados',
    '/alumnos/registrados': 'Alumnos registrados',
    '/alumnos/nuevo-ingreso': 'Nuevo ingreso',
    '/alumnos/preinscripciones': 'Preinscripciones',
    '/representantes': 'Representantes',
    '/solicitudes': 'Solicitudes',
    '/grados': 'Grados y Secciones',
    '/configuracion/usuarios': 'Usuarios',
    '/configuracion/roles': 'Roles',
    '/configuracion/modulos': 'Modulos'
  }
  const requiredModule = routeModuleMap[location.pathname]
  if (requiredModule && !canOpenModule(user, requiredModule)) {
    const allowedRoutes = [
      ['Panel', '/'],
      ['Nuevo ingreso', '/alumnos/nuevo-ingreso'],
      ['Preinscripciones', '/alumnos/preinscripciones'],
      ['Alumnos registrados', '/alumnos/registrados'],
      ['Representantes', '/representantes'],
      ['Solicitudes', '/solicitudes'],
      ['Grados y Secciones', '/grados'],
      ['Usuarios', '/configuracion/usuarios'],
      ['Roles', '/configuracion/roles'],
      ['Modulos', '/configuracion/modulos']
    ]
    const fallbackRoute = allowedRoutes.find(([moduleName]) => canOpenModule(user, moduleName))?.[1] || '/sin-acceso'
    return <Navigate to={fallbackRoute} replace />
  }
  return children
}

function AppHeader({ user, onLogout }) {
  const userName = user?.name || user?.nombre || user?.correo || 'Usuario'
  const roleValue = String(user?.role || user?.rol || 'usuario').trim()
  const normalizedRole = roleValue.toLowerCase()
  const role = normalizedRole === 'admin' || normalizedRole === 'administrador'
    ? 'Administrador'
    : normalizedRole === 'user' || normalizedRole === 'usuario'
      ? 'Usuario'
      : roleValue.charAt(0).toLocaleUpperCase('es') + roleValue.slice(1)
  const initials = userName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toLocaleUpperCase('es')).join('')

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <span className="app-header-brand-mark" aria-hidden="true">C</span>
        <div>
          <strong>Sistema de preinscripción</strong>
          <span>Portal de admisiones</span>
        </div>
      </div>
      <div className="app-header-account">
        <div className="app-header-user">
          <span className="app-header-avatar" aria-hidden="true">{initials || 'U'}</span>
          <span className="app-header-user-copy">
            <strong>{userName}</strong>
            <small>{role}</small>
          </span>
        </div>
        <button className="app-header-logout" type="button" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 17l5-5-5-5M15 12H3" />
            <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
          </svg>
          <span>Salir</span>
        </button>
      </div>
    </header>
  )
}

export default function App(){
  const location = useLocation()
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const { user, logout } = useAuth()
  const hideSidebar = location.pathname === '/login'

  useEffect(() => {
    if (!showLogoutConfirmation) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowLogoutConfirmation(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showLogoutConfirmation])

  const confirmLogout = async () => {
    setShowLogoutConfirmation(false)
    await logout()
  }

  return (
    <div className={`app-shell${hideSidebar ? ' app-shell--full' : ''}`}>
      {!hideSidebar && <Sidebar />}
      <main className="main-content">
        {!hideSidebar && user && <AppHeader user={user} onLogout={() => setShowLogoutConfirmation(true)} />}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/alumnos" element={<PrivateRoute><Navigate to="/alumnos/registrados" replace /></PrivateRoute>} />
          <Route path="/alumnos/registrados" element={<PrivateRoute><AlumnosPage /></PrivateRoute>} />
          <Route path="/alumnos/nuevo-ingreso" element={<PrivateRoute><PreinscripcionPage standaloneModalStyle /></PrivateRoute>} />
          <Route path="/alumnos/preinscripciones" element={<PrivateRoute><PreinscripcionesPage /></PrivateRoute>} />
          <Route path="/representantes" element={<PrivateRoute><RepresentantesPage /></PrivateRoute>} />
          <Route path="/preinscripciones" element={<PrivateRoute><Navigate to="/alumnos/preinscripciones" replace /></PrivateRoute>} />
          <Route path="/solicitudes" element={<PrivateRoute><SolicitudesPage /></PrivateRoute>} />
          <Route path="/grados" element={<PrivateRoute><GradosPage /></PrivateRoute>} />
          <Route path="/configuracion" element={<PrivateRoute><Navigate to="/configuracion/usuarios" replace /></PrivateRoute>} />
          <Route path="/configuracion/usuarios" element={<PrivateRoute><UsuariosPage /></PrivateRoute>} />
          <Route path="/configuracion/roles" element={<PrivateRoute><RolesPage /></PrivateRoute>} />
          <Route path="/configuracion/modulos" element={<PrivateRoute><ModulosPage /></PrivateRoute>} />
          <Route path="/sin-acceso" element={<PrivateRoute><div className="page-content"><p role="alert">Tu cuenta no tiene permisos de lectura asignados. Contacta al administrador.</p></div></PrivateRoute>} />
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </main>
      {showLogoutConfirmation && (
        <div
          className="logout-confirmation-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowLogoutConfirmation(false)
          }}
        >
          <section
            className="logout-confirmation-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-confirmation-title"
            aria-describedby="logout-confirmation-description"
          >
            <span className="logout-confirmation-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l5-5-5-5M15 12H3" />
                <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
              </svg>
            </span>
            <h2 id="logout-confirmation-title">¿Está seguro de que desea salir?</h2>
            <p id="logout-confirmation-description">Se cerrará su sesión y volverá a la pantalla de inicio de sesión.</p>
            <div className="logout-confirmation-actions">
              <div className="logout-confirmation-action">
                <button
                  className="logout-confirmation-button logout-confirmation-button--cancel"
                  type="button"
                  aria-label="Cancelar salida"
                  title="Cancelar"
                  onClick={() => setShowLogoutConfirmation(false)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m18 6-12 12M6 6l12 12" />
                  </svg>
                </button>
                <span>Cancelar</span>
              </div>
              <div className="logout-confirmation-action">
                <button
                  className="logout-confirmation-button logout-confirmation-button--confirm"
                  type="button"
                  aria-label="Confirmar salida"
                  title="Salir al inicio de sesión"
                  onClick={confirmLogout}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 17l5-5-5-5M15 12H3" />
                    <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
                  </svg>
                </button>
                <span>Salir</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
