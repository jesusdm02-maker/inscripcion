import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchModulos } from '../services/api'
import { hasModuleAccess } from '../utils/permissions'

export default function ModulosPage() {
  const { user } = useAuth()
  const canRead = hasModuleAccess(user, 'Modulos')
  const [modulos, setModulos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const loadModulos = async () => {
    try {
      setLoading(true)
      const data = await fetchModulos(user?.role, user?.id)
      setModulos(data)
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los módulos y sus páginas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user && canRead) {
      loadModulos()
    } else {
      setModulos([])
      setLoading(false)
    }
  }, [user, canRead])

  return (
    <div className="page-content management-page management-page--modulos">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">ADMINISTRACIÓN</span>
          <h2>Módulos del sistema</h2>
          <p>Este catálogo corresponde a las opciones de navegación y sus páginas.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-card">
        <div className="table-card-header">
          <div>
            <h3>Opciones y páginas del sidebar</h3>
            <p className="management-card-subtitle">Catálogo sincronizado con la navegación; los permisos de cada rol se gestionan en Usuarios.</p>
          </div>
          <div className="management-header-actions">
            <span className="management-count">{modulos.length.toLocaleString('es')} {modulos.length === 1 ? 'opción' : 'opciones'}</span>
          </div>
        </div>
        {!canRead ? <div className="management-empty-state">La lectura de módulos está deshabilitada.</div> : loading ? <p className="management-state">Cargando módulos...</p> : modulos.length === 0 ? <div className="management-empty-state">Todavía no hay módulos registrados.</div> : (
          <div className="management-table-scroll">
          <table className="styled-table">
            <thead>
              <tr><th>Nombre del sidebar</th><th>Página</th><th>Ruta</th></tr>
            </thead>
            <tbody>
              {modulos.map(modulo => (
                <tr key={`${modulo.id_modulo}-${modulo.url}`}>
                  <td><span className="management-primary-cell">{modulo.nombre_pagina}</span></td>
                  <td><span className="management-secondary-cell">{modulo.nombre_pagina || 'Sin página asociada'}</span></td>
                  <td><span className="management-secondary-cell">{modulo.url || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
