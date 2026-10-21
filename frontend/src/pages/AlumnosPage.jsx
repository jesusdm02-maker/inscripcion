import React, { useEffect, useState } from 'react'
import { deleteAlumnos, fetchAlumnosPage, updateAlumno } from '../services/api'
import AlumnosList from '../components/AlumnosList'
import Pagination from '../components/Pagination'
import CircularActionButton from '../components/CircularActionButton'
import { useAuth } from '../context/AuthContext'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

export default function AlumnosPage(){
  const { user } = useAuth()
  const canRead = hasModuleAccess(user, 'Alumnos')
  const [alumnos, setAlumnos] = useState([])
  const [page, setPage] = useState(1)
  const [limit] = useState(8)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [editingAlumno, setEditingAlumno] = useState(null)
  const [form, setForm] = useState({ nombres: '', apellidos: '', fecha_nacimiento: '', alergias_condiciones: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!canRead) {
      setAlumnos([])
      setTotal(0)
      setSelectedIds([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setSelectedIds([])

    fetchAlumnosPage(page, limit)
      .then(data => {
        setAlumnos(data.data)
        setTotal(data.total)
      })
      .catch(err => {
        console.error(err)
        setError('No se pudieron cargar los alumnos. Intenta de nuevo más tarde.')
      })
      .finally(() => setLoading(false))
  }, [page, limit, canRead])

  const totalPages = Math.ceil(total / limit)
  const selectedAlumno = alumnos.find((alumno) => selectedIds.length === 1 && alumno.id === selectedIds[0])
  const toggleSelection = (id) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const openEditModal = () => {
    if (!canUpdate || !selectedAlumno) return
    setForm({
      nombres: selectedAlumno.nombres || '',
      apellidos: selectedAlumno.apellidos || '',
      fecha_nacimiento: selectedAlumno.fecha_nacimiento?.slice(0, 10) || '',
      alergias_condiciones: selectedAlumno.alergias_condiciones || ''
    })
    setEditingAlumno(selectedAlumno)
    setError('')
  }

  const saveAlumno = async (event) => {
    event.preventDefault()
    if (!canUpdate || !editingAlumno) return
    setSaving(true)
    setError('')
    try {
      await updateAlumno(editingAlumno.id, form, user?.role, user?.id)
      const refreshed = await fetchAlumnosPage(page, limit)
      setAlumnos(refreshed.data)
      setSelectedIds([])
      setEditingAlumno(null)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el alumno.')
    } finally {
      setSaving(false)
    }
  }

  const removeSelected = async () => {
    if (!canDelete) return
    const targets = alumnos.filter((alumno) => selectedIds.includes(alumno.id))
    if (!targets.length) return
    const confirmation = window.confirm(targets.length === 1
      ? `¿Eliminar a ${targets[0].nombres} ${targets[0].apellidos}? También se retirará su inscripción y se liberará el cupo correspondiente.`
      : `¿Eliminar los ${selectedIds.length} alumnos seleccionados? También se retirarán sus inscripciones y se liberarán los cupos correspondientes.`)
    if (!confirmation) return
    setError('')
    try {
      await deleteAlumnos(selectedIds, user?.role, user?.id)
      setSelectedIds([])
      const refreshed = await fetchAlumnosPage(page, limit)
      if (refreshed.data.length === 0 && page > 1) {
        setPage(page - 1)
      } else {
        setAlumnos(refreshed.data)
        setTotal(refreshed.total)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron eliminar los alumnos seleccionados.')
    }
  }

  const canUpdate = hasPermission(user, 'Alumnos', 'Actualizar')
  const canDelete = hasPermission(user, 'Alumnos', 'Eliminar')

  return (
    <div className="page-content management-page management-page--alumnos">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">COMUNIDAD ESCOLAR</span>
          <h2>Alumnos</h2>
          <p>Consulta los alumnos registrados y sus representantes.</p>
        </div>
      </div>

      <div className="table-card">
        <div className="management-table-heading">
          <div>
            <h3>Directorio de alumnos</h3>
            <p>{total.toLocaleString('es')} registros en el sistema</p>
          </div>
          <div className="management-header-actions">
            <span className="management-count">{total.toLocaleString('es')} {total === 1 ? 'alumno' : 'alumnos'}</span>
            <div className="circular-actions" aria-label="Acciones de alumnos">
              <CircularActionButton action="edit" label="Editar alumno seleccionado" title={!canUpdate ? 'No tienes permiso para editar alumnos' : selectedIds.length > 1 ? 'Selecciona un solo alumno para editar' : 'Editar alumno seleccionado'} disabled={!canUpdate || !selectedAlumno} onClick={openEditModal} />
              <CircularActionButton action="delete" label={`Eliminar ${selectedIds.length} alumnos seleccionados`} title={!canDelete ? 'No tienes permiso para eliminar alumnos' : undefined} disabled={!canDelete || !selectedIds.length} onClick={removeSelected} />
            </div>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {!canRead ? (
          <div className="management-empty-state">La lectura de alumnos está deshabilitada.</div>
        ) : loading ? (
          <p className="management-state">Cargando alumnos...</p>
        ) : error ? (
          <p className="error-message management-state">{error}</p>
        ) : (
          <>
            <AlumnosList
              alumnos={alumnos}
              selectedIds={selectedIds}
              onToggle={toggleSelection}
            />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
      {editingAlumno && canUpdate && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditingAlumno(null)
        }}>
          <section className="modal-card management-form-modal management-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-alumno-title">
            <header className="management-form-modal-header">
              <span className="management-eyebrow">REGISTRO ACADÉMICO · ALUMNO #{editingAlumno.id}</span>
              <h3 id="edit-alumno-title">Editar alumno</h3>
              <p>Actualiza la información personal y de salud del estudiante.</p>
            </header>
            <form className="form-grid" onSubmit={saveAlumno}>
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Datos personales</h4>
                  <p>Identificación básica del estudiante.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Nombre
                    <input value={form.nombres} onChange={(event) => setForm({ ...form, nombres: event.target.value })} placeholder="Escribe los nombres del alumno" required />
                  </label>
                  <label>Apellidos
                    <input value={form.apellidos} onChange={(event) => setForm({ ...form, apellidos: event.target.value })} placeholder="Escribe los apellidos del alumno" required />
                  </label>
                  <label>Fecha de nacimiento
                    <input type="date" value={form.fecha_nacimiento} onChange={(event) => setForm({ ...form, fecha_nacimiento: event.target.value })} />
                  </label>
                </div>
              </section>
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Información de salud</h4>
                  <p>Registra alergias o condiciones que deban considerarse.</p>
                </div>
                <label>Alergias y condiciones
                  <textarea value={form.alergias_condiciones} onChange={(event) => setForm({ ...form, alergias_condiciones: event.target.value })} placeholder="Indica las alergias o condiciones médicas" rows="3" />
                </label>
              </section>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="form-actions">
                <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={() => setEditingAlumno(null)} disabled={saving} />
                <CircularActionButton action="save" type="submit" label={saving ? 'Guardando cambios' : 'Guardar cambios'} title={saving ? 'Guardando cambios' : 'Guardar cambios'} disabled={saving || !canUpdate} />
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
