import React, { useEffect, useState } from 'react'
import { deleteRepresentantes, fetchRepresentantes, updateRepresentante } from '../services/api'
import { useAuth } from '../context/AuthContext'
import CircularActionButton from '../components/CircularActionButton'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

const emptyForm = {
  nombre: '',
  apellido: '',
  cedula: '',
  parentesco: '',
  municipio: '',
  calle: '',
  avenida: '',
  num_casa: '',
  numero_telefono: ''
}

export default function RepresentantesPage() {
  const { user } = useAuth()
  const canRead = hasModuleAccess(user, 'Representantes')
  const [representantes, setRepresentantes] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [editingRepresentante, setEditingRepresentante] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadRepresentantes = async () => {
    if (!canRead) {
      setRepresentantes([])
      setSelectedIds([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setRepresentantes(await fetchRepresentantes())
      setSelectedIds([])
      setError('')
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.error || 'No se pudieron cargar los representantes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRepresentantes()
  }, [canRead])

  const toggleSelection = (id) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const selectedRepresentative = representantes.find((representante) =>
    selectedIds.length === 1 && representante.id === selectedIds[0])
  const canUpdate = hasPermission(user, 'Representantes', 'Actualizar')
  const canDelete = hasPermission(user, 'Representantes', 'Eliminar')

  const openEditModal = () => {
    if (!canUpdate || !selectedRepresentative) return
    setForm({
      nombre: selectedRepresentative.nombre || '',
      apellido: selectedRepresentative.apellido || '',
      cedula: selectedRepresentative.cedula || '',
      parentesco: selectedRepresentative.parentesco || '',
      municipio: selectedRepresentative.municipio || '',
      calle: selectedRepresentative.calle || '',
      avenida: selectedRepresentative.avenida || '',
      num_casa: selectedRepresentative.num_casa || '',
      numero_telefono: selectedRepresentative.numero_telefono || ''
    })
    setEditingRepresentante(selectedRepresentative)
    setError('')
  }

  const saveRepresentative = async (event) => {
    event.preventDefault()
    if (!canUpdate || !editingRepresentante) return
    setSaving(true)
    setError('')
    try {
      await updateRepresentante(editingRepresentante.id, form, user?.role, user?.id)
      setEditingRepresentante(null)
      await loadRepresentantes()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el representante.')
    } finally {
      setSaving(false)
    }
  }

  const removeSelected = async () => {
    if (!canDelete) return
    if (!selectedIds.length) return
    const selected = representantes.filter((item) => selectedIds.includes(item.id))
    const confirmation = window.confirm(selected.length === 1
      ? `¿Eliminar a ${selected[0].nombre} ${selected[0].apellido}?`
      : `¿Eliminar los ${selected.length} representantes seleccionados?`)
    if (!confirmation) return
    setError('')
    try {
      await deleteRepresentantes(selectedIds, user?.role, user?.id)
      await loadRepresentantes()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron eliminar los representantes seleccionados.')
    }
  }

  return (
    <div className="page-content management-page management-page--representantes">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">COMUNIDAD ESCOLAR</span>
          <h2>Representantes</h2>
          <p>Directorio de responsables vinculados a los alumnos.</p>
        </div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="table-card">
        <div className="management-table-heading">
          <div>
            <h3>Directorio de representantes</h3>
            <p>Selecciona uno para editar o varios para eliminarlos.</p>
          </div>
          <div className="management-header-actions">
            <span className="management-count">{representantes.length.toLocaleString('es')} registros</span>
            <div className="circular-actions" aria-label="Acciones de representantes">
              <CircularActionButton action="edit" label="Editar representante seleccionado" title={!canUpdate ? 'No tienes permiso para editar representantes' : selectedIds.length > 1 ? 'Selecciona un solo representante para editar' : 'Editar representante seleccionado'} disabled={!canUpdate || !selectedRepresentative} onClick={openEditModal} />
              <CircularActionButton action="delete" label={`Eliminar ${selectedIds.length} representantes seleccionados`} title={!canDelete ? 'No tienes permiso para eliminar representantes' : undefined} disabled={!canDelete || !selectedIds.length} onClick={removeSelected} />
            </div>
          </div>
        </div>
        {!canRead ? <div className="management-empty-state">La lectura de representantes está deshabilitada.</div> : loading ? <div className="management-state">Cargando representantes...</div> : representantes.length === 0 ? (
          <div className="management-empty-state">Todavía no hay representantes registrados.</div>
        ) : (
          <div className="management-table-scroll">
            <table className="styled-table">
              <thead>
                <tr><th>ID</th><th>Nombre</th><th>Apellido</th><th>Alumno(s)</th><th>Cédula</th><th>Parentesco</th><th>Dirección</th><th>Teléfono</th></tr>
              </thead>
              <tbody>
                {representantes.map((representante) => (
                  <tr
                    key={representante.id}
                    className={selectedIds.includes(representante.id) ? 'table-row-selected' : ''}
                    aria-selected={selectedIds.includes(representante.id)}
                    tabIndex={0}
                    onClick={() => toggleSelection(representante.id)}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        toggleSelection(representante.id)
                      }
                    }}
                  >
                    <td>{representante.id}</td>
                    <td>{representante.nombre}</td>
                    <td>{representante.apellido}</td>
                    <td>{representante.alumnos || 'Sin alumnos asociados'}</td>
                    <td>{representante.cedula}</td>
                    <td>{representante.parentesco}</td>
                    <td>{`${representante.municipio || ''} ${representante.calle || ''} ${representante.avenida || ''} ${representante.num_casa || ''}`.trim()}</td>
                    <td>{representante.numero_telefono}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingRepresentante && canUpdate && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditingRepresentante(null)
        }}>
          <section className="modal-card management-form-modal management-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-representante-title">
            <header className="management-form-modal-header">
              <span className="management-eyebrow">REGISTRO FAMILIAR · REPRESENTANTE #{editingRepresentante.id}</span>
              <h3 id="edit-representante-title">Editar representante</h3>
              <p>Actualiza los datos de contacto y domicilio del representante.</p>
            </header>
            <form className="form-grid" onSubmit={saveRepresentative}>
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Datos del representante</h4>
                  <p>Identificación y relación con el estudiante.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Nombre<input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} placeholder="Escribe los nombres del representante" required /></label>
                  <label>Apellido<input value={form.apellido} onChange={(event) => setForm({ ...form, apellido: event.target.value })} placeholder="Escribe los apellidos del representante" required /></label>
                  <label>Cédula<input value={form.cedula} onChange={(event) => setForm({ ...form, cedula: event.target.value })} placeholder="Escribe la cédula del representante" required /></label>
                  <label>Parentesco<input value={form.parentesco} onChange={(event) => setForm({ ...form, parentesco: event.target.value })} placeholder="Indica el parentesco con el alumno" required /></label>
                </div>
              </section>
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Dirección</h4>
                  <p>Domicilio de residencia del representante.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Municipio<input value={form.municipio} onChange={(event) => setForm({ ...form, municipio: event.target.value })} placeholder="Escribe el municipio de residencia" /></label>
                  <label>Calle<input value={form.calle} onChange={(event) => setForm({ ...form, calle: event.target.value })} placeholder="Escribe la calle de residencia" /></label>
                  <label>Avenida<input value={form.avenida} onChange={(event) => setForm({ ...form, avenida: event.target.value })} placeholder="Escribe la avenida de residencia" /></label>
                  <label>Número de casa<input value={form.num_casa} onChange={(event) => setForm({ ...form, num_casa: event.target.value })} placeholder="Escribe el número de casa" /></label>
                </div>
              </section>
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Contacto</h4>
                  <p>Teléfono para comunicaciones relacionadas con el estudiante.</p>
                </div>
                <label>Teléfono<input type="tel" value={form.numero_telefono} onChange={(event) => setForm({ ...form, numero_telefono: event.target.value })} placeholder="Escribe el teléfono del representante" required /></label>
              </section>
              <div className="form-actions">
                <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={() => setEditingRepresentante(null)} disabled={saving} />
                <CircularActionButton action="save" type="submit" label={saving ? 'Guardando cambios' : 'Guardar cambios'} title={saving ? 'Guardando cambios' : 'Guardar cambios'} disabled={saving || !canUpdate} />
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
