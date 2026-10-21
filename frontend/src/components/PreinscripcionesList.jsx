import React, { useEffect, useState } from 'react'
import {
  deletePreinscripciones,
  fetchCatalogos,
  fetchPreinscripciones,
  updatePreinscripcion
} from '../services/api'
import CircularActionButton from './CircularActionButton'

const emptyForm = {
  nombres: '',
  apellidos: '',
  fecha_nacimiento: '',
  documento: '',
  alergias_condiciones: '',
  representante_nombre: '',
  representante_apellido: '',
  representante_cedula: '',
  representante_parentesco: '',
  telefono: '',
  correo: '',
  direccion_municipio: '',
  direccion_calle: '',
  direccion_avenida: '',
  direccion_num_casa: '',
  grado_id: '',
  seccion_id: '',
  periodo_id: ''
}

function keepLatestEnrollmentPerStudent(items) {
  const latestByStudent = new Map()
  const unlinkedItems = []

  items.forEach((item) => {
    if (item.alumno_id == null) {
      unlinkedItems.push(item)
      return
    }

    const studentId = String(item.alumno_id)
    const current = latestByStudent.get(studentId)
    if (!current || Number(item.id_preinscripcion) > Number(current.id_preinscripcion)) {
      latestByStudent.set(studentId, item)
    }
  })

  return [...latestByStudent.values(), ...unlinkedItems]
    .sort((first, second) => Number(first.id_preinscripcion) - Number(second.id_preinscripcion))
}

export default function PreinscripcionesList({ user, canUpdate, canDelete }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [catalogs, setCatalogs] = useState({ grados: [], periodos: [] })
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])

  const loadPreinscripciones = async () => {
    setLoading(true)
    try {
      const data = await fetchPreinscripciones()
      const latestItems = keepLatestEnrollmentPerStudent(data)
      setItems(latestItems)
      setSelectedIds((current) => current.filter((id) =>
        latestItems.some((item) => item.id_preinscripcion === id)))
      setError('')
    } catch (err) {
      console.error('No se pudieron cargar las preinscripciones:', err)
      setError('No se pudieron cargar las preinscripciones.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPreinscripciones()
  }, [])

  const openEdit = async (item) => {
    if (!canUpdate || !item) return
    setLoadingEdit(true)
    setError('')
    try {
      const data = await fetchCatalogos()
      setCatalogs({ grados: data.grados || [], periodos: data.periodos || [] })
      setEditForm({
        nombres: item.nombres || '',
        apellidos: item.apellidos || '',
        fecha_nacimiento: item.fecha_nacimiento?.slice(0, 10) || '',
        documento: item.documento || '',
        alergias_condiciones: item.alergias_condiciones || '',
        representante_nombre: item.representante_nombre || '',
        representante_apellido: item.representante_apellido || '',
        representante_cedula: item.representante_cedula || '',
        representante_parentesco: item.representante_parentesco || '',
        telefono: item.telefono || '',
        correo: item.correo || '',
        direccion_municipio: item.direccion_municipio || '',
        direccion_calle: item.direccion_calle || '',
        direccion_avenida: item.direccion_avenida || '',
        direccion_num_casa: item.direccion_num_casa || '',
        grado_id: String(item.grado_id || ''),
        seccion_id: String(item.seccion_id || ''),
        periodo_id: String(item.periodo_id || '')
      })
      setEditingItem(item)
    } catch (err) {
      console.error('No se pudieron cargar los datos para editar la preinscripción:', err)
      setError(err.response?.data?.error || 'No se pudieron cargar los datos de edición.')
    } finally {
      setLoadingEdit(false)
    }
    }

    const selectedItem = items.find((item) =>
      selectedIds.length === 1 && item.id_preinscripcion === selectedIds[0])
    const toggleSelection = (id) => setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id])

  const handleChange = (event) => {
    const { name, value } = event.target
    setEditForm((current) => {
      const next = { ...current, [name]: value }
      if (name === 'grado_id') {
        const nextGrade = catalogs.grados.find((grade) => String(grade.id) === value)
        next.seccion_id = nextGrade?.secciones?.some((section) => String(section.id_seccion) === current.seccion_id)
          ? current.seccion_id
          : ''
      }
      return next
    })
  }

  const savePreinscripcion = async (event) => {
    event.preventDefault()
    if (!canUpdate || !editingItem || saving) return
    setSaving(true)
    setError('')
    try {
      await updatePreinscripcion(editingItem.id_preinscripcion, editForm, user?.role, user?.id)
      setEditingItem(null)
      setSelectedIds([])
      await loadPreinscripciones()
    } catch (err) {
      console.error('No se pudo actualizar la preinscripción:', err)
      setError(err.response?.data?.error || 'No se pudo actualizar la preinscripción.')
    } finally {
      setSaving(false)
    }
  }

  const removeSelected = async () => {
    if (!canDelete) return
    const targets = items.filter((item) => selectedIds.includes(item.id_preinscripcion))
    if (!targets.length) return
    const confirmation = targets.length === 1
      ? `¿Eliminar la preinscripción de ${targets[0].alumno}? Se liberará el cupo y se conservará el registro del alumno.`
      : `¿Eliminar las ${targets.length} preinscripciones seleccionadas? Se liberarán sus cupos y se conservarán los registros de los alumnos.`
    const confirmed = window.confirm(confirmation)
    if (!confirmed) return
    setError('')
    try {
      await deletePreinscripciones(selectedIds, user?.role, user?.id)
      setSelectedIds([])
      await loadPreinscripciones()
    } catch (err) {
      console.error('No se pudieron eliminar las preinscripciones seleccionadas:', err)
      setError(err.response?.data?.error || 'No se pudieron eliminar las preinscripciones seleccionadas.')
    }
  }

  const selectedGrade = catalogs.grados.find((grade) => String(grade.id) === editForm.grado_id)
  const selectedSections = selectedGrade?.secciones || []

  if (loading && items.length === 0) return <div className="management-state">Cargando preinscripciones...</div>
  if (error && items.length === 0) return <div className="management-state management-state--error" role="alert">{error}</div>
  if (items.length === 0) return <div className="management-empty-state">Todavía no hay preinscripciones registradas.</div>

  return (
    <>
      {error && <p className="form-error preinscripcion-list-error" role="alert">{error}</p>}
      <div className="management-header-actions preinscripciones-selection-actions">
        <span className="management-count">
          {selectedIds.length
            ? `${selectedIds.length} ${selectedIds.length === 1 ? 'registro seleccionado' : 'registros seleccionados'}`
            : 'Selecciona uno o más registros'}
        </span>
        <div className="circular-actions" aria-label="Acciones de preinscripciones seleccionadas">
          <CircularActionButton
            action="edit"
            label="Editar preinscripción seleccionada"
            title={!canUpdate ? 'No tienes permiso para editar preinscripciones' : selectedIds.length > 1 ? 'Selecciona un solo registro para editar' : 'Editar preinscripción seleccionada'}
            disabled={!canUpdate || !selectedItem || loadingEdit}
            onClick={() => openEdit(selectedItem)}
          />
          <CircularActionButton
            action="delete"
            label={`Eliminar ${selectedIds.length} preinscripciones seleccionadas`}
            title={!canDelete ? 'No tienes permiso para eliminar preinscripciones' : undefined}
            disabled={!canDelete || !selectedIds.length}
            onClick={removeSelected}
          />
        </div>
      </div>
      <div className="management-table-scroll">
        <table className="styled-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Alumno</th>
              <th>Grado</th>
              <th>Período</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id_preinscripcion}
                className={selectedIds.includes(item.id_preinscripcion) ? 'table-row-selected' : ''}
                aria-selected={selectedIds.includes(item.id_preinscripcion)}
                tabIndex={0}
                onClick={() => toggleSelection(item.id_preinscripcion)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    toggleSelection(item.id_preinscripcion)
                  }
                }}
              >
                <td>{item.id_preinscripcion}</td>
                <td>{item.alumno}</td>
                <td>{item.nombre_grado}</td>
                <td>{item.periodo}</td>
                <td>{item.usuario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingItem && canUpdate && (
        <div className="modal-overlay preinscripcion-edit-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditingItem(null)
        }}>
          <section className="modal-card preinscripcion-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-preinscripcion-title">
            <header className="management-form-modal-header">
              <span className="management-eyebrow">REGISTRO DE INGRESO · #{editingItem.id_preinscripcion}</span>
              <h3 id="edit-preinscripcion-title">Editar datos de preinscripción</h3>
              <p>Actualiza los datos del alumno, su representante y la asignación académica.</p>
            </header>
            <form className="preinscripcion-edit-form" onSubmit={savePreinscripcion}>
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Datos del alumno</h4>
                  <p>Información personal y de identificación registrada.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Nombres<input name="nombres" value={editForm.nombres} onChange={handleChange} maxLength={100} required /></label>
                  <label>Apellidos<input name="apellidos" value={editForm.apellidos} onChange={handleChange} maxLength={100} required /></label>
                  <label>Fecha de nacimiento<input type="date" name="fecha_nacimiento" value={editForm.fecha_nacimiento} onChange={handleChange} required /></label>
                  <label>Documento de identidad<input name="documento" value={editForm.documento} onChange={handleChange} maxLength={100} required /></label>
                  <label className="preinscripcion-edit-fields-wide">Alergias y condiciones médicas<textarea name="alergias_condiciones" value={editForm.alergias_condiciones} onChange={handleChange} rows="3" /></label>
                </div>
              </section>

              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Datos del representante</h4>
                  <p>Identificación y parentesco del responsable.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Nombres<input name="representante_nombre" value={editForm.representante_nombre} onChange={handleChange} maxLength={75} required /></label>
                  <label>Apellidos<input name="representante_apellido" value={editForm.representante_apellido} onChange={handleChange} maxLength={75} required /></label>
                  <label>Cédula<input name="representante_cedula" value={editForm.representante_cedula} onChange={handleChange} maxLength={20} required /></label>
                  <label>Parentesco<input name="representante_parentesco" value={editForm.representante_parentesco} onChange={handleChange} maxLength={50} required /></label>
                </div>
              </section>

              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Contacto y domicilio</h4>
                  <p>Datos para comunicaciones y ubicación del representante.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Teléfono<input type="tel" name="telefono" value={editForm.telefono} onChange={handleChange} maxLength={50} required /></label>
                  <label>Correo electrónico<input type="email" name="correo" value={editForm.correo} onChange={handleChange} required /></label>
                  <label>Municipio<input name="direccion_municipio" value={editForm.direccion_municipio} onChange={handleChange} maxLength={50} required /></label>
                  <label>Calle<input name="direccion_calle" value={editForm.direccion_calle} onChange={handleChange} maxLength={50} required /></label>
                  <label>Avenida<input name="direccion_avenida" value={editForm.direccion_avenida} onChange={handleChange} maxLength={50} required /></label>
                  <label>Número de casa<input name="direccion_num_casa" value={editForm.direccion_num_casa} onChange={handleChange} maxLength={50} required /></label>
                </div>
              </section>

              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Asignación académica</h4>
                  <p>Grado, sección y período asociados a esta preinscripción.</p>
                </div>
                <div className="management-edit-fields">
                  <label>Grado
                    <select name="grado_id" value={editForm.grado_id} onChange={handleChange} required>
                      <option value="">Selecciona un grado</option>
                      {catalogs.grados.map((grade) => <option key={grade.id} value={String(grade.id)}>{grade.nombre_grado}</option>)}
                    </select>
                  </label>
                  <label>Sección
                    <select name="seccion_id" value={editForm.seccion_id} onChange={handleChange} required disabled={!selectedGrade}>
                      <option value="">Selecciona una sección</option>
                      {selectedSections.map((section) => <option key={section.id_seccion} value={String(section.id_seccion)}>{section.nombre_seccion}</option>)}
                    </select>
                  </label>
                  <label>Período
                    <select name="periodo_id" value={editForm.periodo_id} onChange={handleChange} required>
                      <option value="">Selecciona un período</option>
                      {catalogs.periodos.map((period) => <option key={period.id} value={String(period.id)}>{period.fecha_inicio}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              <div className="form-actions">
                <CircularActionButton action="exit" label="Cancelar edición" title="Cancelar edición" onClick={() => setEditingItem(null)} disabled={saving} />
                <CircularActionButton action="save" type="submit" label={saving ? 'Guardando cambios' : 'Guardar cambios'} title={saving ? 'Guardando cambios' : 'Guardar cambios'} disabled={saving} />
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
