import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { createGrado, createSeccion, deleteGrados, deleteSecciones, fetchGrados, fetchSecciones, updateGrado, updateSeccion } from '../services/api'
import CircularActionButton from '../components/CircularActionButton'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

export default function GradosPage() {
  const { user } = useAuth()
  const canRead = hasModuleAccess(user, 'Grados y Secciones')
  const canCreate = hasPermission(user, 'Grados y Secciones', 'Crear')
  const canUpdate = hasPermission(user, 'Grados y Secciones', 'Actualizar')
  const canDelete = hasPermission(user, 'Grados y Secciones', 'Eliminar')
  const [grados, setGrados] = useState([])
  const [secciones, setSecciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showGradoForm, setShowGradoForm] = useState(false)
  const [showSeccionForm, setShowSeccionForm] = useState(false)
  const [savingGrado, setSavingGrado] = useState(false)
  const [savingSeccion, setSavingSeccion] = useState(false)
  const [editingGradoId, setEditingGradoId] = useState(null)
  const [editingSeccionId, setEditingSeccionId] = useState(null)
  const [selectedGradoIds, setSelectedGradoIds] = useState([])
  const [selectedSeccionIds, setSelectedSeccionIds] = useState([])
  const [gradoForm, setGradoForm] = useState({ nombre_grado: '', cupos_disponibles: '', id_secciones: [] })
  const [seccionForm, setSeccionForm] = useState({ nombre_seccion: '', id_grado: '' })

  const loadData = async () => {
    try {
      setLoading(true)
      const [gradosData, seccionesData] = await Promise.all([
        fetchGrados(user?.role, user?.id),
        fetchSecciones(user?.role, user?.id)
      ])
      const nextGrados = Array.isArray(gradosData) ? gradosData : []
      const nextSecciones = Array.isArray(seccionesData) ? seccionesData : []
      setGrados(nextGrados)
      setSecciones(nextSecciones)
      setSelectedGradoIds((current) => current.filter((id) => nextGrados.some((grado) => grado.id === id)))
      setSelectedSeccionIds((current) => current.filter((id) => nextSecciones.some((seccion) => seccion.id === id)))
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar grados y secciones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user && canRead) {
      loadData()
    } else {
      setGrados([])
      setSecciones([])
      setSelectedGradoIds([])
      setSelectedSeccionIds([])
      setLoading(false)
    }
  }, [user, canRead])

  const handleGradoChange = (event) => {
    setGradoForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const handleSeccionSelection = (event) => {
    const id = event.target.value
    setGradoForm((current) => ({
      ...current,
      id_secciones: event.target.checked
        ? [...current.id_secciones, id]
        : current.id_secciones.filter((selectedId) => selectedId !== id)
    }))
  }

  const handleSaveGrado = async (event) => {
    event.preventDefault()
    if (editingGradoId !== null ? !canUpdate : !canCreate) return
    setSavingGrado(true)
    setError('')
    setMessage('')

    try {
      const data = {
        ...gradoForm,
        cupos_disponibles: gradoForm.cupos_disponibles === '' ? null : Number(gradoForm.cupos_disponibles),
        id_secciones: gradoForm.id_secciones.map(Number)
      }
      if (editingGradoId !== null) {
        await updateGrado(editingGradoId, data, user?.role, user?.id)
        setMessage('Grado actualizado correctamente.')
      } else {
        await createGrado(data, user?.role, user?.id)
        setMessage('Grado creado correctamente.')
      }
      setGradoForm({ nombre_grado: '', cupos_disponibles: '', id_secciones: [] })
      setShowGradoForm(false)
      setEditingGradoId(null)
      setSelectedGradoIds([])
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el grado')
    } finally {
      setSavingGrado(false)
    }
  }

  const handleSaveSeccion = async (event) => {
    event.preventDefault()
    if (editingSeccionId !== null ? !canUpdate : !canCreate) return
    setSavingSeccion(true)
    setError('')
    setMessage('')

    try {
      const data = {
        ...seccionForm,
        id_grado: seccionForm.id_grado ? Number(seccionForm.id_grado) : null
      }
      if (editingSeccionId !== null) {
        await updateSeccion(editingSeccionId, data, user?.role, user?.id)
        setMessage('Sección actualizada correctamente.')
      } else {
        await createSeccion(data, user?.role, user?.id)
        setMessage('Sección creada correctamente.')
      }
      setSeccionForm({ nombre_seccion: '', id_grado: '' })
      setShowSeccionForm(false)
      setEditingSeccionId(null)
      setSelectedSeccionIds([])
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la sección')
    } finally {
      setSavingSeccion(false)
    }
  }

  const openGradoForm = (grado = null) => {
    if (grado ? !canUpdate : !canCreate) return
    setError('')
    setMessage('')
    if (!grado) setSelectedGradoIds([])
    setEditingGradoId(grado?.id ?? null)
    setGradoForm(grado
      ? { nombre_grado: grado.nombre_grado || '', cupos_disponibles: grado.cupos_disponibles ?? '', id_secciones: [] }
      : { nombre_grado: '', cupos_disponibles: '', id_secciones: [] })
    setShowGradoForm(true)
  }

  const openSeccionForm = (seccion = null) => {
    if (seccion ? !canUpdate : !canCreate) return
    setError('')
    setMessage('')
    if (!seccion) setSelectedSeccionIds([])
    setEditingSeccionId(seccion?.id ?? null)
    setSeccionForm({
      nombre_seccion: seccion?.nombre_seccion || '',
      id_grado: ''
    })
    setShowSeccionForm(true)
  }

  const handleDeleteGrados = async () => {
    if (!canDelete || !selectedGradoIds.length) return
    const count = selectedGradoIds.length
    const confirmation = count === 1
      ? `¿Eliminar el grado "${selectedGrados[0].nombre_grado}"?`
      : `¿Eliminar los ${count} grados seleccionados?`
    if (!window.confirm(confirmation)) return
    setError('')
    setMessage('')

    try {
      await deleteGrados(selectedGradoIds, user?.role, user?.id)
      setMessage(count === 1 ? 'Grado eliminado correctamente.' : `Se eliminaron ${count} grados correctamente.`)
      setSelectedGradoIds([])
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron eliminar los grados seleccionados')
    }
  }

  const handleDeleteSecciones = async () => {
    if (!canDelete || !selectedSeccionIds.length) return
    const count = selectedSeccionIds.length
    const confirmation = count === 1
      ? `¿Eliminar la sección "${selectedSecciones[0].nombre_seccion}"?`
      : `¿Eliminar las ${count} secciones seleccionadas?`
    if (!window.confirm(confirmation)) return
    setError('')
    setMessage('')

    try {
      await deleteSecciones(selectedSeccionIds, user?.role, user?.id)
      setMessage(count === 1 ? 'Sección eliminada correctamente.' : `Se eliminaron ${count} secciones correctamente.`)
      setSelectedSeccionIds([])
      await loadData()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron eliminar las secciones seleccionadas')
    }
  }

  const selectGrado = (grado) => {
    setSelectedGradoIds((current) => current.includes(grado.id)
      ? current.filter((id) => id !== grado.id)
      : [...current, grado.id])
    if (editingGradoId !== null) {
      setEditingGradoId(null)
      setShowGradoForm(false)
    }
  }

  const selectSeccion = (seccion) => {
    setSelectedSeccionIds((current) => current.includes(seccion.id)
      ? current.filter((id) => id !== seccion.id)
      : [...current, seccion.id])
    if (editingSeccionId !== null) {
      setEditingSeccionId(null)
      setShowSeccionForm(false)
    }
  }

  const selectedGrados = grados.filter((grado) => selectedGradoIds.includes(grado.id))
  const selectedSecciones = secciones.filter((seccion) => selectedSeccionIds.includes(seccion.id))
  const selectedGrado = selectedGrados.length === 1 ? selectedGrados[0] : null
  const selectedSeccion = selectedSecciones.length === 1 ? selectedSecciones[0] : null

  return (
    <div className="page-content grade-management-page">
      <div className="page-header">
        <span className="dashboard-eyebrow">CONFIGURACIÓN ACADÉMICA</span>
        <h2>Grados y Secciones</h2>
        <p>Administra los niveles escolares y sus secciones.</p>
      </div>

      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <div className="grade-management-grid">
        <section className="grade-management-panel" aria-labelledby="grades-heading">
          <div className="grade-management-heading">
            <div>
              <span className="grade-management-kicker">NIVELES</span>
              <h3 id="grades-heading">Grados</h3>
            </div>
            <div className="grade-heading-actions">
              <button type="button" className="grade-add-button" onClick={() => openGradoForm()} disabled={!canCreate} aria-label="Nuevo grado" title={canCreate ? 'Nuevo grado' : 'No tienes permiso para crear grados'}>
                <PlusIcon />
              </button>
              <button type="button" className="grade-icon-button grade-icon-button--edit" onClick={() => selectedGrado && openGradoForm(selectedGrado)} disabled={!canUpdate || selectedGradoIds.length !== 1} aria-label="Editar grado seleccionado" title={!canUpdate ? 'No tienes permiso para editar grados' : selectedGradoIds.length > 1 ? 'Solo puedes editar un grado a la vez' : 'Editar grado seleccionado'}><PencilIcon /></button>
              <button type="button" className="grade-icon-button grade-icon-button--delete" onClick={handleDeleteGrados} disabled={!canDelete || selectedGradoIds.length === 0} aria-label={selectedGradoIds.length === 1 ? 'Eliminar grado seleccionado' : `Eliminar ${selectedGradoIds.length} grados seleccionados`} title={canDelete ? 'Eliminar grados seleccionados' : 'No tienes permiso para eliminar grados'}>
                <TrashIcon />
              </button>
            </div>
          </div>

          {!canRead ? <p className="grade-empty-state">La lectura de grados está deshabilitada.</p> : loading ? <p className="grade-empty-state">Cargando grados...</p> : grados.length === 0 ? (
            <p className="grade-empty-state">Todavía no hay grados registrados.</p>
          ) : (
            <ul className="grade-record-list" role="listbox" aria-label="Grados" aria-multiselectable="true">
              {grados.map((grado) => (
                <li
                  key={grado.id}
                  className={`grade-record${selectedGradoIds.includes(grado.id) ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={selectedGradoIds.includes(grado.id)}
                  tabIndex={0}
                  onClick={() => selectGrado(grado)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectGrado(grado)
                    }
                  }}
                >
                  <div className="grade-record-select">
                    <span className="grade-record-details">
                      <strong>{grado.nombre_grado}</strong>
                      <span>{grado.secciones || 'Sin secciones asignadas'}</span>
                    </span>
                    <span className="grade-capacity">{grado.cupos_disponibles ?? '—'} <small>cupos</small></span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grade-management-panel" aria-labelledby="sections-heading">
          <div className="grade-management-heading">
            <div>
              <span className="grade-management-kicker">GRUPOS</span>
              <h3 id="sections-heading">Secciones</h3>
            </div>
            <div className="grade-heading-actions">
              <button type="button" className="grade-add-button" onClick={() => openSeccionForm()} disabled={!canCreate} aria-label="Nueva sección" title={canCreate ? 'Nueva sección' : 'No tienes permiso para crear secciones'}>
                <PlusIcon />
              </button>
              <button type="button" className="grade-icon-button grade-icon-button--edit" onClick={() => selectedSeccion && openSeccionForm(selectedSeccion)} disabled={!canUpdate || selectedSeccionIds.length !== 1} aria-label="Editar sección seleccionada" title={!canUpdate ? 'No tienes permiso para editar secciones' : selectedSeccionIds.length > 1 ? 'Solo puedes editar una sección a la vez' : 'Editar sección seleccionada'}><PencilIcon /></button>
              <button type="button" className="grade-icon-button grade-icon-button--delete" onClick={handleDeleteSecciones} disabled={!canDelete || selectedSeccionIds.length === 0} aria-label={selectedSeccionIds.length === 1 ? 'Eliminar sección seleccionada' : `Eliminar ${selectedSeccionIds.length} secciones seleccionadas`} title={canDelete ? 'Eliminar secciones seleccionadas' : 'No tienes permiso para eliminar secciones'}>
                <TrashIcon />
              </button>
            </div>
          </div>

          {!canRead ? <p className="grade-empty-state">La lectura de secciones está deshabilitada.</p> : loading ? <p className="grade-empty-state">Cargando secciones...</p> : secciones.length === 0 ? (
            <p className="grade-empty-state">Todavía no hay secciones registradas.</p>
          ) : (
            <ul className="grade-record-list" role="listbox" aria-label="Secciones" aria-multiselectable="true">
              {secciones.map((seccion) => (
                <li
                  key={seccion.id}
                  className={`grade-record${selectedSeccionIds.includes(seccion.id) ? ' is-selected' : ''}`}
                  role="option"
                  aria-selected={selectedSeccionIds.includes(seccion.id)}
                  tabIndex={0}
                  onClick={() => selectSeccion(seccion)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectSeccion(seccion)
                    }
                  }}
                >
                  <div className="grade-record-select">
                    <span className="grade-record-details">
                      <strong>Sección {seccion.nombre_seccion}</strong>
                      <span>{seccion.grados}</span>
                    </span>
                    <span className="grade-section-id">#{seccion.id}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {showGradoForm && (editingGradoId !== null ? canUpdate : canCreate) && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingGrado) {
            setShowGradoForm(false)
            setEditingGradoId(null)
          }
        }}>
          <section className={`modal-card management-form-modal grade-form-modal${editingGradoId !== null ? ' management-edit-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="grade-form-title">
            <header className="management-form-modal-header">
              <span className="management-eyebrow">CONFIGURACIÓN ACADÉMICA</span>
              <h3 id="grade-form-title">{editingGradoId !== null ? 'Editar grado' : 'Nuevo grado'}</h3>
              <p>{editingGradoId !== null ? 'Actualiza los datos de este nivel escolar.' : 'Registra un nuevo nivel y define su capacidad inicial.'}</p>
            </header>
            <form className="grade-create-form management-modal-form" onSubmit={handleSaveGrado}>
              <label>
                Nombre del grado
                <input name="nombre_grado" value={gradoForm.nombre_grado} onChange={handleGradoChange} maxLength="50" placeholder="Escribe el nombre del grado" required />
              </label>
              <label>
                Cupos disponibles
                <input type="number" name="cupos_disponibles" value={gradoForm.cupos_disponibles} onChange={handleGradoChange} min="0" step="1" placeholder="Deja vacío si no hay límite de cupos" />
              </label>
              {editingGradoId === null && secciones.length > 0 && (
                <fieldset className="grade-section-picker">
                  <legend>Secciones iniciales</legend>
                  <div className="grade-section-options">
                    {secciones.map((seccion) => (
                      <label key={seccion.id}>
                        <input type="checkbox" value={String(seccion.id)} checked={gradoForm.id_secciones.includes(String(seccion.id))} onChange={handleSeccionSelection} />
                        {seccion.nombre_seccion}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="grade-form-actions">
                <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={() => { setShowGradoForm(false); setEditingGradoId(null) }} disabled={savingGrado} />
                <CircularActionButton action={editingGradoId !== null ? 'save' : 'create'} type="submit" label={savingGrado ? 'Guardando grado' : editingGradoId !== null ? 'Guardar cambios del grado' : 'Crear grado'} title={savingGrado ? 'Guardando grado' : editingGradoId !== null ? 'Guardar cambios del grado' : 'Crear grado'} disabled={savingGrado || (editingGradoId !== null ? !canUpdate : !canCreate)} />
              </div>
            </form>
          </section>
        </div>
      )}
      {showSeccionForm && (editingSeccionId !== null ? canUpdate : canCreate) && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingSeccion) {
            setShowSeccionForm(false)
            setEditingSeccionId(null)
          }
        }}>
          <section className={`modal-card management-form-modal grade-form-modal${editingSeccionId !== null ? ' management-edit-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="section-form-title">
            <header className="management-form-modal-header">
              <span className="management-eyebrow">CONFIGURACIÓN ACADÉMICA</span>
              <h3 id="section-form-title">{editingSeccionId !== null ? 'Editar sección' : 'Nueva sección'}</h3>
              <p>{editingSeccionId !== null ? 'Actualiza el nombre de la sección seleccionada.' : 'Registra un grupo y asígnalo a un grado si corresponde.'}</p>
            </header>
            <form className="grade-create-form management-modal-form" onSubmit={handleSaveSeccion}>
              <label>
                Nombre de la sección
                <input name="nombre_seccion" value={seccionForm.nombre_seccion} onChange={(event) => setSeccionForm((current) => ({ ...current, nombre_seccion: event.target.value }))} maxLength="50" placeholder="Escribe el nombre de la sección" required />
              </label>
              {editingSeccionId === null && <label>
                Asignar a un grado
                <select name="id_grado" value={seccionForm.id_grado} onChange={(event) => setSeccionForm((current) => ({ ...current, id_grado: event.target.value }))}>
                  <option value="">Sin asignar todavía</option>
                  {grados.map((grado) => <option key={grado.id} value={grado.id}>{grado.nombre_grado}</option>)}
                </select>
              </label>}
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="grade-form-actions">
                <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={() => { setShowSeccionForm(false); setEditingSeccionId(null) }} disabled={savingSeccion} />
                <CircularActionButton action={editingSeccionId !== null ? 'save' : 'create'} type="submit" label={savingSeccion ? 'Guardando sección' : editingSeccionId !== null ? 'Guardar cambios de la sección' : 'Crear sección'} title={savingSeccion ? 'Guardando sección' : editingSeccionId !== null ? 'Guardar cambios de la sección' : 'Crear sección'} disabled={savingSeccion || (editingSeccionId !== null ? !canUpdate : !canCreate)} />
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
}

function PencilIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" /></svg>
}

function TrashIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>
}
