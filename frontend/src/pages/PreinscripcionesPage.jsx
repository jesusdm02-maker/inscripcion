import React, { useEffect, useState } from 'react'
import PreinscripcionesList from '../components/PreinscripcionesList'
import CircularActionButton from '../components/CircularActionButton'
import PreinscripcionPage from './PreinscripcionPage'
import { useAuth } from '../context/AuthContext'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

export default function PreinscripcionesPage(){
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [listVersion, setListVersion] = useState(0)
  useEffect(() => {
    if (!showForm) return undefined
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [showForm])

  const canRead = hasModuleAccess(user, 'Preinscripciones')
  const canCreate = hasPermission(user, 'Preinscripciones', 'Crear') &&
    hasPermission(user, 'Alumnos', 'Crear') &&
    hasPermission(user, 'Representantes', 'Crear')
  const canUpdate = hasPermission(user, 'Preinscripciones', 'Actualizar')
  const canDelete = hasPermission(user, 'Preinscripciones', 'Eliminar')
  const isRepresentative = String(user?.role || user?.rol || '').trim().toLocaleLowerCase('es') === 'representante'
  const openCreateForm = () => {
    if (canCreate) setShowForm(true)
  }
  if (isRepresentative) return <PreinscripcionPage standaloneModalStyle formPurpose="preinscripcion" />

  return (
    <div className="page-content management-page management-page--preinscripciones">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">ADMISIÓN</span>
          <h2>Preinscripciones</h2>
          <p>Consulta los ingresos registrados y su asignación académica.</p>
        </div>
        <CircularActionButton
          action="preinscription"
          label="Nueva preinscripción"
          title={canCreate ? 'Nueva preinscripción' : 'No tienes permiso para crear preinscripciones'}
          disabled={!canCreate}
          onClick={openCreateForm}
        />
      </div>
      {!canRead && <div className="management-empty-state">La lectura de preinscripciones está deshabilitada.</div>}
      {canRead && <div className="table-card">
        <div className="management-table-heading">
          <div>
            <h3>Registros de ingreso</h3>
            <p>Información de alumno, grado, período y responsable.</p>
          </div>
        </div>
        <PreinscripcionesList
          key={listVersion}
          user={user}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      </div>}
      {canCreate && showForm && (
        <div className="modal-overlay preinscripcion-create-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowForm(false)
        }}>
          <section className="modal-card preinscripcion-create-modal" role="dialog" aria-modal="true" aria-labelledby="preinscripcion-modal-title">
            <header className="preinscripcion-create-header">
              <div>
                <span className="management-eyebrow">ADMISIÓN · ALUMNO REGISTRADO</span>
                <h3 id="preinscripcion-modal-title">Solicitud de preinscripción</h3>
                <p>Busca al alumno registrado y selecciona el nuevo grado solicitado.</p>
              </div>
              <CircularActionButton action="exit" label="Cerrar formulario" title="Cerrar formulario" onClick={() => setShowForm(false)} />
            </header>
            <PreinscripcionPage
              onCancel={() => setShowForm(false)}
              onSubmitted={() => setListVersion((version) => version + 1)}
              modalMode
              existingStudentMode
            />
          </section>
        </div>
      )}
    </div>
  )
}
