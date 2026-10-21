import React, { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCurrentUserPermissions, loginUser, logoutUser } from '../services/api'
import { canOpenModule } from '../utils/permissions'

const AUTH_STORAGE_KEY = 'colegio_user'
const AuthContext = createContext(null)

function normalizeUser(userData) {
  if (!userData) return null
  return {
    ...userData,
    id: userData.id ?? userData.id_user ?? null,
    role: userData.role ?? userData.rol ?? null,
    modules: Array.isArray(userData.modules) ? userData.modules : [],
    modulePermissions: userData.modulePermissions && typeof userData.modulePermissions === 'object'
      ? userData.modulePermissions
      : {}
  }
}

function getFirstAllowedRoute(user) {
    const routes = [
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
    return routes.find(([moduleName]) => canOpenModule(user, moduleName))?.[1] || '/sin-acceso'
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      return normalizeUser(raw ? JSON.parse(raw) : null)
    } catch {
      return null
    }
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return
    }

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
  }, [user])

  useEffect(() => {
    const accessToken = user?.accessToken
    if (!accessToken) return undefined

    let active = true
    const refreshPermissions = async () => {
      try {
        const permissionData = await fetchCurrentUserPermissions(accessToken)
        if (!active) return
        setUser((current) => current?.accessToken === accessToken
          ? normalizeUser({ ...current, ...permissionData })
          : current)
      } catch (err) {
        if (!active) return
        if (err.response?.status === 401) {
          setUser((current) => current?.accessToken === accessToken ? null : current)
          navigate('/login')
          return
        }
        console.error('No se pudieron sincronizar los permisos de la sesión:', err)
      }
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshPermissions()
    }

    refreshPermissions()
    window.addEventListener('focus', refreshPermissions)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.removeEventListener('focus', refreshPermissions)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [user?.accessToken, navigate])

  const login = async ({ username, password }) => {
    setError('')
    try {
      const userData = normalizeUser(await loginUser({ correo: username, password }))
      const fallbackRoute = getFirstAllowedRoute(userData)
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData))
      setUser(userData)
      navigate(fallbackRoute)
      return true
    } catch (err) {
      setError(err.response?.data?.error || 'Usuario o contraseña incorrectos')
      return false
    }
  }

  const logout = async () => {
    try {
      if (user?.accessToken) await logoutUser()
    } catch (err) {
      console.error('No se pudo revocar la sesión en el servidor:', err)
    } finally {
      setUser(null)
      localStorage.removeItem(AUTH_STORAGE_KEY)
      navigate('/login')
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
