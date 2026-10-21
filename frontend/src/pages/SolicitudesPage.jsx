import React, { useEffect, useState } from 'react'
import CircularActionButton from '../components/CircularActionButton'
import { fetchSolicitudes, approveSolicitud, deleteSolicitudes, fetchCatalogos, fetchDocumentCatalogs, updateSolicitud } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

const editableFields = [
  ['nombres', 'Nombre del alumno'],
  ['apellidos', 'Apellidos del alumno'],
  ['documento', 'Documento del alumno'],
  ['fecha_nacimiento', 'Fecha de nacimiento', 'date'],
  ['alergias_condiciones', 'Alergias y condiciones', 'textarea'],
  ['representante_nombre', 'Nombre del representante'],
  ['representante_apellido', 'Apellido del representante'],
  ['representante_cedula', 'Cédula del representante'],
  ['representante_parentesco', 'Parentesco'],
  ['telefono', 'Teléfono'],
  ['correo', 'Correo electrónico', 'email'],
  ['direccion_municipio', 'Municipio'],
  ['direccion_calle', 'Calle'],
  ['direccion_avenida', 'Avenida'],
  ['direccion_num_casa', 'Número de casa'],
  ['fecha_inicio', 'Período de ingreso']
]

const editableFieldSections = [
  {
    title: 'Datos del alumno',
    description: 'Información personal y de salud del estudiante.',
    fields: ['nombres', 'apellidos', 'documento', 'fecha_nacimiento', 'alergias_condiciones']
  },
  {
    title: 'Representante',
    description: 'Identificación y medios de contacto.',
    fields: ['representante_nombre', 'representante_apellido', 'representante_cedula', 'representante_parentesco', 'telefono', 'correo']
  },
  {
    title: 'Dirección',
    description: 'Domicilio asociado a la solicitud.',
    fields: ['direccion_municipio', 'direccion_calle', 'direccion_avenida', 'direccion_num_casa']
  },
  {
    title: 'Ingreso académico',
    description: 'Período para el que se solicita el ingreso.',
    fields: ['fecha_inicio']
  }
]

function getSolicitudDetails(solicitud) {
  const value = solicitud?.inscripcion_formal
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function getSolicitudType(solicitud) {
  return getSolicitudDetails(solicitud).tipo_solicitud || solicitud?.tipo_solicitud || 'nuevo_ingreso'
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newPendingCount, setNewPendingCount] = useState(0)
  const [approvalSolicitud, setApprovalSolicitud] = useState(null)
  const [approving, setApproving] = useState(false)
  const [approvalError, setApprovalError] = useState('')
  const [approvalGrades, setApprovalGrades] = useState([])
  const [editPeriods, setEditPeriods] = useState([])
  const [approvalSectionId, setApprovalSectionId] = useState('')
  const [approvalStatusId, setApprovalStatusId] = useState('')
  const [approvalMovementId, setApprovalMovementId] = useState('')
  const [approvalDocumentCatalogs, setApprovalDocumentCatalogs] = useState({ statuses: [], movements: [] })
  const [loadingApprovalCatalogs, setLoadingApprovalCatalogs] = useState(false)
  const [loadingEditCatalogs, setLoadingEditCatalogs] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [requestFilter, setRequestFilter] = useState('all')
  const [filterDraft, setFilterDraft] = useState('all')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [filterOptionsOpen, setFilterOptionsOpen] = useState(false)
  const [editingSolicitud, setEditingSolicitud] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [rejectingIds, setRejectingIds] = useState([])
  const { user } = useAuth()

  const canRead = hasModuleAccess(user, 'Solicitudes')
  const canUpdate = hasPermission(user, 'Solicitudes', 'Actualizar')
  const canDelete = hasPermission(user, 'Solicitudes', 'Eliminar')
  const canApprove = canUpdate &&
    hasPermission(user, 'Preinscripciones', 'Crear') &&
    hasPermission(user, 'Alumnos', 'Crear') &&
    hasPermission(user, 'Representantes', 'Crear')
  const approvalDetails = getSolicitudDetails(approvalSolicitud)
  const isExistingStudentApproval = approvalDetails.tipo_solicitud === 'preinscripcion_existente'
  const editSelectedGrade = approvalGrades.find((grade) => String(grade.id) === String(editForm.grado_id))

  useEffect(() => {
    if (!editingSolicitud) return undefined
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = previousOverflow
    }
  }, [editingSolicitud])

  useEffect(() => {
    if (canRead) loadSolicitudes()
    else {
      setSolicitudes([])
      setLoading(false)
    }
  }, [canRead])

  const loadSolicitudes = async () => {
    setLoading(true)
    try {
      const data = await fetchSolicitudes()
      const pendingCount = data.filter(item => item.estado === 'Pendiente').length
      const previousPending = solicitudes.filter(item => item.estado === 'Pendiente').length
      if (canApprove && pendingCount > previousPending) {
        setNewPendingCount(pendingCount - previousPending)
      }
      setSolicitudes(data)
      setSelectedIds((current) => current.filter((id) => data.some((item) => item.id === id)))
    } catch (err) {
      setError('No se pudo cargar las solicitudes.')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!canApprove || !approvalSolicitud || approving) return
    const missingSelections = []
    if (!approvalSectionId) missingSelections.push('la sección')
    if (!isExistingStudentApproval && !approvalStatusId) missingSelections.push('el estado del documento')
    if (!isExistingStudentApproval && !approvalMovementId) missingSelections.push('el movimiento del documento')
    if (missingSelections.length > 0) {
      setApprovalError(`Debes seleccionar ${missingSelections.join(', ')} antes de registrar la inscripción.`)
      return
    }
    setApprovalError('')
    setApproving(true)
    try {
      const result = await approveSolicitud(approvalSolicitud.id, {
        aprobado_por: user.name,
        seccion_id: Number(approvalSectionId),
        status_id: approvalStatusId ? Number(approvalStatusId) : null,
        movimiento_id: approvalMovementId ? Number(approvalMovementId) : null
      }, user?.role, user?.id)
      setApprovalSolicitud(null)
      setSelectedIds((current) => current.filter((id) => id !== approvalSolicitud.id))
      await loadSolicitudes()
      setError(result.temporal_cleanup_error
        ? 'La solicitud se aprobó e inscribió, pero el backend no pudo eliminar su archivo temporal. Revisa el registro del servidor.'
        : '')
    } catch (err) {
      setApprovalError(err.response?.data?.error || 'No se pudo aprobar e inscribir la solicitud.')
    } finally {
      setApproving(false)
    }
  }

  const selectedRequests = solicitudes.filter((item) => selectedIds.includes(item.id))
  const visibleSolicitudes = solicitudes.filter((item) => {
    if (requestFilter === 'all') return true
    const requestType = getSolicitudType(item)
    return requestFilter === 'preinscripcion'
      ? requestType === 'preinscripcion_existente'
      : requestType !== 'preinscripcion_existente'
  })
  const selectedRequest = selectedRequests.length === 1 &&
    ['Pendiente', 'Aprobado'].includes(selectedRequests[0].estado) &&
    Boolean(getSolicitudDetails(selectedRequests[0]).nombres)
    ? selectedRequests[0]
    : null
  const isApprovedEdit = editingSolicitud?.estado === 'Aprobado'
  const isPendingExistingStudentEdit = editingSolicitud?.estado === 'Pendiente' &&
    getSolicitudDetails(editingSolicitud).tipo_solicitud === 'preinscripcion_existente'
  const toggleSelection = (id) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const openFilterModal = () => {
    setFilterDraft(requestFilter)
    setFilterOptionsOpen(false)
    setFilterModalOpen(true)
  }
  const applyRequestFilter = (event) => {
    event.preventDefault()
    setRequestFilter(filterDraft)
    setSelectedIds([])
    setFilterOptionsOpen(false)
    setFilterModalOpen(false)
  }
  const filterLabels = {
    all: 'Todas las solicitudes',
    nuevo_ingreso: 'Solicitudes de nuevo ingreso',
    preinscripcion: 'Solicitudes de preinscripción'
  }
  const approvalGrade = approvalGrades.find((grade) =>
    approvalDetails.grado_id
      ? String(grade.id) === String(approvalDetails.grado_id)
      : grade.nombre_grado === approvalDetails.grado_nombre)
  const approvalSections = approvalGrade?.secciones || []

  const openApproval = async (solicitud) => {
    if (!canApprove || !solicitud) return
    setApprovalSolicitud(solicitud)
    setApprovalSectionId('')
    setApprovalStatusId('')
    setApprovalMovementId('')
    setApprovalGrades([])
    setApprovalDocumentCatalogs({ statuses: [], movements: [] })
    setLoadingApprovalCatalogs(true)
    setApprovalError('')
    try {
      const [catalogs, documentCatalogs] = await Promise.all([
        fetchCatalogos(),
        getSolicitudType(solicitud) === 'preinscripcion_existente'
          ? Promise.resolve({ statuses: [], movements: [] })
          : fetchDocumentCatalogs()
      ])
      setApprovalGrades(catalogs.grados || [])
      setApprovalDocumentCatalogs({
        statuses: documentCatalogs.statuses || [],
        movements: documentCatalogs.movements || []
      })
    } catch (err) {
      setApprovalError(err.response?.data?.error || 'No se pudieron cargar las opciones para inscribir.')
    } finally {
      setLoadingApprovalCatalogs(false)
    }
  }

  const openEditModal = async () => {
    if (!canUpdate) return
    if (!selectedRequest) {
      setError(selectedRequests.length > 1
        ? 'Selecciona una sola solicitud pendiente o aprobada para editar.'
        : 'Solo se pueden editar solicitudes pendientes o aprobadas con los datos completos.')
      return
    }
    const details = getSolicitudDetails(selectedRequest)
    if (selectedRequest.estado === 'Aprobado' || details.tipo_solicitud === 'preinscripcion_existente') {
      setLoadingEditCatalogs(true)
      try {
        const catalogs = await fetchCatalogos()
        setApprovalGrades(catalogs.grados || [])
        setEditPeriods(catalogs.periodos || [])
        if (selectedRequest.estado === 'Aprobado') {
          setEditForm({
            ...Object.fromEntries(editableFields.map(([key]) => [key, details[key] || ''])),
            grado_id: String(details.grado_id || ''),
            seccion_id: String(details.seccion_id || ''),
            periodo_id: String(details.periodo_id || '')
          })
          setEditingSolicitud(selectedRequest)
          setError('')
          return
        }
        setEditForm({
          alumno_id: details.alumno_id,
          grado_id: String(details.grado_id || ''),
          grado_nombre: details.grado_nombre || '',
          periodo_id: details.periodo_id,
          current_preinscripcion_id: details.current_preinscripcion_id,
          id_r_a_d: details.id_r_a_d
        })
        setEditingSolicitud(selectedRequest)
        setError('')
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar los grados disponibles.')
      } finally {
        setLoadingEditCatalogs(false)
      }
      return
    }
    setEditForm(Object.fromEntries(editableFields.map(([key]) => [key, details[key] || ''])))
    setEditingSolicitud(selectedRequest)
    setError('')
  }

  const saveSolicitud = async (event) => {
    event.preventDefault()
    if (!canUpdate || !editingSolicitud) return
    if (!editingSolicitud || savingEdit) return
    setSavingEdit(true)
    setError('')
    try {
      const originalDetails = getSolicitudDetails(editingSolicitud)
      const updatedDetails = isPendingExistingStudentEdit
        ? {
            ...originalDetails,
            grado_id: Number(editForm.grado_id),
            grado_nombre: approvalGrades.find((grade) => String(grade.id) === String(editForm.grado_id))?.nombre_grado || ''
          }
        : isApprovedEdit
          ? {
              ...originalDetails,
              ...editForm,
              grado_id: Number(editForm.grado_id),
              seccion_id: Number(editForm.seccion_id),
              periodo_id: Number(editForm.periodo_id)
            }
          : { ...originalDetails, ...editForm }
      await updateSolicitud(editingSolicitud.id, { inscripcion_formal: updatedDetails }, user?.role, user?.id)
      setEditingSolicitud(null)
      setSelectedIds([])
      await loadSolicitudes()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar la solicitud.')
    } finally {
      setSavingEdit(false)
    }
  }

  const removeSelected = async () => {
    if (!canDelete) return
    if (!selectedIds.length) return
    if (selectedRequests.some((item) => item.estado !== 'Pendiente')) {
      setError('Solo se pueden eliminar solicitudes pendientes. Quita de la selección las solicitudes ya procesadas.')
      return
    }
    const confirmation = window.confirm(selectedIds.length === 1
      ? `¿Eliminar la solicitud pendiente #${selectedIds[0]}?`
      : `¿Eliminar las ${selectedIds.length} solicitudes pendientes seleccionadas?`)
    if (!confirmation) return
    setError('')
    try {
      const result = await deleteSolicitudes(selectedIds, user?.role, user?.id)
      setSelectedIds([])
      await loadSolicitudes()
      if (result.cleanupErrors?.length) {
        setError(`Se eliminaron las solicitudes, pero no se pudieron limpiar ${result.cleanupErrors.length} archivo(s) temporal(es). Revisa el registro del servidor.`)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron eliminar las solicitudes seleccionadas.')
    }
  }

  const rejectSolicitud = async (solicitud) => {
    if (!canDelete || solicitud?.estado !== 'Pendiente' || rejectingIds.includes(solicitud.id)) return
    const confirmation = window.confirm(
      `¿Rechazar la solicitud #${solicitud.id}? Se eliminarán sus datos temporales y no se podrá recuperar.`
    )
    if (!confirmation) return

    setRejectingIds((current) => [...current, solicitud.id])
    setError('')
    try {
      const result = await deleteSolicitudes([solicitud.id], user?.role, user?.id)
      setSelectedIds((current) => current.filter((id) => id !== solicitud.id))
      await loadSolicitudes()
      if (result.cleanupErrors?.length) {
        setError('La solicitud se eliminó, pero no se pudo borrar su información temporal del archivo JSON. Revisa el registro del servidor.')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo rechazar la solicitud.')
    } finally {
      setRejectingIds((current) => current.filter((id) => id !== solicitud.id))
    }
  }

  if (loading) return <div className="page-content management-page"><div className="management-state">Cargando solicitudes...</div></div>
  const pendingRequests = solicitudes.filter(item => item.estado === 'Pendiente').length
  const approvedRequests = solicitudes.filter(item => ['Aprobado', 'Inscrito Activo'].includes(item.estado)).length
  const enrolledRequests = approvedRequests
  const detailRows = [
    ['Alumno', [approvalDetails.nombres, approvalDetails.apellidos].filter(Boolean).join(' ')],
    ['Documento del alumno', approvalDetails.documento],
    ['Fecha de nacimiento', approvalDetails.fecha_nacimiento],
    ['Alergias y condiciones', approvalDetails.alergias_condiciones],
    ['Representante', [approvalDetails.representante_nombre, approvalDetails.representante_apellido].filter(Boolean).join(' ')],
    ['Cédula del representante', approvalDetails.representante_cedula],
    ['Parentesco', approvalDetails.representante_parentesco],
    ['Teléfono', approvalDetails.telefono],
    ['Correo', approvalDetails.correo],
    ['Dirección', [approvalDetails.direccion_num_casa, approvalDetails.direccion_calle, approvalDetails.direccion_avenida, approvalDetails.direccion_municipio].filter(Boolean).join(', ')],
    ['Grado', approvalDetails.grado_nombre],
    ['Período de ingreso', approvalDetails.fecha_inicio]
  ]
  const visibleDetailRows = isExistingStudentApproval
    ? [
        ['Alumno registrado', [approvalDetails.nombres, approvalDetails.apellidos].filter(Boolean).join(' ')],
        ['Documento del alumno', approvalDetails.documento],
        ['Grado actual', approvalDetails.grado_actual],
        ['Grado solicitado', approvalDetails.grado_nombre],
        ['Período que se conservará', approvalDetails.fecha_inicio]
      ]
    : detailRows
  const attachmentRows = [
    ['Cédula del representante', approvalDetails.foto_cedula],
    ['Cédula del alumno', approvalDetails.foto_alumno]
  ]

  return (
    <div className="page-content management-page management-page--solicitudes">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">ADMISIÓN</span>
          <h2>Solicitudes</h2>
          <p>Revisa cada solicitud y continúa el proceso de ingreso.</p>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!canRead && <div className="management-empty-state">La lectura de solicitudes está deshabilitada.</div>}
      {canRead && <>
      {newPendingCount > 0 && (
        <div className="form-success management-notice" role="status">
          Tienes {newPendingCount} nueva{newPendingCount > 1 ? 's' : ''} solicitud{newPendingCount > 1 ? 'es' : ''} pendiente{newPendingCount > 1 ? 's' : ''}.
        </div>
      )}
      <section className="management-summary" aria-label="Resumen de solicitudes">
        <div><span>Total</span><strong>{solicitudes.length.toLocaleString('es')}</strong></div>
        <div className="management-summary--pending"><span>Pendientes</span><strong>{pendingRequests.toLocaleString('es')}</strong></div>
        <div className="management-summary--approved"><span>Aprobadas</span><strong>{approvedRequests.toLocaleString('es')}</strong></div>
        <div className="management-summary--enrolled"><span>Inscritos</span><strong>{enrolledRequests.toLocaleString('es')}</strong></div>
      </section>
      <div className="table-card">
        <div className="management-table-heading">
          <div>
            <h3>Registro de solicitudes</h3>
            <p>Contacto del aspirante, estado y siguiente acción.</p>
          </div>
          <div className="management-header-actions">
            <span className="management-count">{visibleSolicitudes.length.toLocaleString('es')} registros</span>
            <div className="circular-actions" aria-label="Acciones de solicitudes">
              <CircularActionButton
                action="filter"
                label={`Filtrar solicitudes: ${filterLabels[requestFilter]}`}
                title="Filtrar solicitudes por tipo"
                onClick={openFilterModal}
                aria-pressed={requestFilter !== 'all'}
              />
              <CircularActionButton action="edit" label="Editar solicitud seleccionada" title={!canUpdate ? 'No tienes permiso para actualizar solicitudes' : 'Editar una solicitud pendiente o aprobada'} disabled={!canUpdate || !selectedIds.length} onClick={openEditModal} />
              <CircularActionButton action="delete" label={`Eliminar ${selectedIds.length} solicitudes seleccionadas`} title={!canDelete ? 'No tienes permiso para eliminar solicitudes' : 'Eliminar solicitudes pendientes seleccionadas'} disabled={!canDelete || !selectedIds.length} onClick={removeSelected} />
            </div>
          </div>
        </div>
        {visibleSolicitudes.length === 0 ? <div className="management-empty-state">{solicitudes.length === 0 ? 'No hay solicitudes para mostrar.' : `No hay ${filterLabels[requestFilter].toLocaleLowerCase('es')}.`}</div> : (
          <div className="management-table-scroll">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Solicitante</th>
                  <th>Documento</th>
                  <th>Contacto</th>
                  <th>Estado y acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleSolicitudes.map(item => (
                  <tr
                    key={item.id}
                    className={selectedIds.includes(item.id) ? 'table-row-selected' : ''}
                    aria-selected={selectedIds.includes(item.id)}
                    tabIndex={0}
                    onClick={() => {
                      toggleSelection(item.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault()
                        toggleSelection(item.id)
                      }
                    }}
                  >
                    <td>
                      <span className="management-primary-cell">{item.nombre_completo}</span>
                      <span className="management-secondary-cell">
                        {getSolicitudType(item) === 'preinscripcion_existente' ? 'Solicitud de preinscripción' : 'Solicitud de nuevo ingreso'}
                        {' · '}#{item.id}
                      </span>
                    </td>
                    <td>{item.documento}</td>
                    <td>
                      <span className="management-primary-cell">{item.telefono}</span>
                      <span className="management-secondary-cell">{item.correo}</span>
                    </td>
                    <td className="actions-cell">
                      <span className={`management-status management-status--${item.estado === 'Pendiente' ? 'pending' : item.estado === 'Aprobado' ? 'approved' : item.estado === 'Inscrito Activo' ? 'enrolled' : 'default'}`}>{item.estado}</span>
                      {item.estado === 'Pendiente' && (
                        <>
                          <CircularActionButton action="review" label={`Revisar e inscribir solicitud ${item.id}`} title={canApprove ? 'Revisar e inscribir' : 'No tienes permisos para revisar e inscribir solicitudes'} onClick={(event) => {
                            event.stopPropagation()
                            openApproval(item)
                          }} disabled={!canApprove} />
                          <CircularActionButton action="reject" label={`Rechazar solicitud ${item.id}`} title={canDelete ? 'Rechazar y eliminar solicitud' : 'No tienes permiso para rechazar solicitudes'} onClick={(event) => {
                            event.stopPropagation()
                            rejectSolicitud(item)
                          }} disabled={!canDelete || rejectingIds.includes(item.id)} />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingSolicitud && canUpdate && (
          <div className="modal-overlay request-edit-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingEdit) setEditingSolicitud(null)
          }}>
            <section className="modal-card management-form-modal management-edit-modal request-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-solicitud-title">
              <div className="request-review-header">
                <span className="management-eyebrow">{isApprovedEdit ? 'SOLICITUD APROBADA' : getSolicitudDetails(editingSolicitud).tipo_solicitud === 'preinscripcion_existente' ? 'PREINSCRIPCIÓN PENDIENTE' : 'SOLICITUD PENDIENTE'} · #{editingSolicitud.id}</span>
                <h3 id="edit-solicitud-title">Editar solicitud</h3>
                <p>{isApprovedEdit
                  ? 'Los cambios se aplicarán también a los datos del alumno, representante y preinscripción registrados.'
                  : getSolicitudDetails(editingSolicitud).tipo_solicitud === 'preinscripcion_existente'
                  ? 'Solo puedes cambiar el grado solicitado; se conservarán los datos del alumno.'
                  : 'Los datos se actualizarán en la solicitud. Los documentos adjuntos se conservarán.'}</p>
              </div>
              <form className="form-grid request-edit-grid" onSubmit={saveSolicitud}>
                {isPendingExistingStudentEdit ? (
                  <section className="management-edit-section request-edit-section">
                    <div className="management-edit-section-heading">
                      <h4>Grado solicitado</h4>
                      <p>El período actual del alumno se conservará.</p>
                    </div>
                    <div className="management-edit-fields">
                      <label>Nuevo grado
                        <select
                          value={editForm.grado_id || ''}
                          onChange={(event) => {
                            const grade = approvalGrades.find((item) => String(item.id) === event.target.value)
                            setEditForm((current) => ({
                              ...current,
                              grado_id: event.target.value,
                              grado_nombre: grade?.nombre_grado || ''
                            }))
                          }}
                          required
                          disabled={loadingEditCatalogs}
                        >
                          <option value="">Selecciona un grado</option>
                          {approvalGrades.map((grade) => (
                            <option
                              key={grade.id}
                              value={String(grade.id)}
                              disabled={(grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) || !grade.secciones?.length}
                            >
                              {grade.nombre_grado}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>
                ) : editableFieldSections.filter((section) =>
                  section.fields.some((key) => !isApprovedEdit || key !== 'fecha_inicio')
                ).map((section) => (
                  <section className="management-edit-section request-edit-section" key={section.title}>
                    <div className="management-edit-section-heading">
                      <h4>{section.title}</h4>
                      <p>{section.description}</p>
                    </div>
                    <div className="management-edit-fields">
                      {editableFields.filter(([key]) => section.fields.includes(key) && (!isApprovedEdit || key !== 'fecha_inicio')).map(([key, label, type]) => (
                        <label key={key}>{label}
                          {type === 'textarea' ? (
                            <textarea value={editForm[key] || ''} onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={`Indica ${label.toLowerCase()}`} rows="3" />
                          ) : (
                            <input type={type || 'text'} value={editForm[key] || ''} onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={type === 'date' ? undefined : type === 'email' ? 'Escribe el correo electrónico' : `Escribe ${label.toLowerCase()}`} required />
                          )}
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
                {isApprovedEdit && (
                  <section className="management-edit-section request-edit-section">
                    <div className="management-edit-section-heading">
                      <h4>Asignación académica</h4>
                      <p>La actualización también se reflejará en la inscripción del alumno.</p>
                    </div>
                    <div className="management-edit-fields">
                      <label>Grado
                        <select
                          value={editForm.grado_id || ''}
                          onChange={(event) => {
                            const grade = approvalGrades.find((item) => String(item.id) === event.target.value)
                            setEditForm((current) => ({
                              ...current,
                              grado_id: event.target.value,
                              seccion_id: '',
                              grado_nombre: grade?.nombre_grado || '',
                              seccion_nombre: ''
                            }))
                          }}
                          required
                          disabled={loadingEditCatalogs}
                        >
                          <option value="">Selecciona un grado</option>
                          {approvalGrades.map((grade) => (
                            <option
                              key={grade.id}
                              value={String(grade.id)}
                              disabled={String(grade.id) !== String(getSolicitudDetails(editingSolicitud).grado_id) &&
                                grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0}
                            >
                              {grade.nombre_grado} · {grade.cupos_disponibles === null
                                ? 'sin límite de cupos'
                                : `${Number(grade.cupos_disponibles)} cupos`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Sección
                        <select
                          value={editForm.seccion_id || ''}
                          onChange={(event) => {
                            const section = editSelectedGrade?.secciones?.find((item) =>
                              String(item.id_seccion) === event.target.value
                            )
                            setEditForm((current) => ({
                              ...current,
                              seccion_id: event.target.value,
                              seccion_nombre: section?.nombre_seccion || ''
                            }))
                          }}
                          required
                          disabled={!editSelectedGrade}
                        >
                          <option value="">Selecciona una sección</option>
                          {(editSelectedGrade?.secciones || []).map((section) => (
                            <option key={section.id_seccion} value={String(section.id_seccion)}>
                              {section.nombre_seccion}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Período
                        <select
                          value={editForm.periodo_id || ''}
                          onChange={(event) => setEditForm((current) => ({
                            ...current,
                            periodo_id: event.target.value,
                            fecha_inicio: editPeriods.find((period) => String(period.id) === event.target.value)?.fecha_inicio || ''
                          }))}
                          required
                          disabled={loadingEditCatalogs}
                        >
                          <option value="">Selecciona un período</option>
                          {editPeriods.map((period) => (
                            <option key={period.id} value={String(period.id)}>{period.fecha_inicio}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>
                )}
                {error && <p className="form-error" role="alert">{error}</p>}
                <div className="form-actions">
                  <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={() => setEditingSolicitud(null)} disabled={savingEdit} />
                  <CircularActionButton action="save" type="submit" label={savingEdit ? 'Guardando solicitud' : 'Guardar cambios de la solicitud'} title={savingEdit ? 'Guardando solicitud' : 'Guardar cambios de la solicitud'} disabled={savingEdit || loadingEditCatalogs || !canUpdate} />
                </div>
              </form>
            </section>
          </div>
        )}
      </div>

      {filterModalOpen && (
        <div
          className="modal-overlay request-filter-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFilterModalOpen(false)
          }}
        >
          <section
            className="modal-card request-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-filter-title"
            aria-describedby="request-filter-description"
          >
            <header className="request-filter-header">
              <span className="request-filter-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h16l-6.5 7.2v5.3l-3 1.5v-6.8L4 5Z" />
                  <path d="M8 8h8" />
                </svg>
              </span>
              <div>
                <span className="management-eyebrow">ORGANIZAR REGISTROS</span>
                <h3 id="request-filter-title">Filtrar solicitudes</h3>
                <p id="request-filter-description">Elige el tipo de solicitud que deseas consultar.</p>
              </div>
            </header>
            <form className="request-filter-form" onSubmit={applyRequestFilter}>
              <label id="request-type-filter-label">Tipo de solicitud</label>
              <div
                className={`request-filter-select${filterOptionsOpen ? ' is-open' : ''}`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setFilterOptionsOpen(false)
                }}
              >
                <button
                  type="button"
                  className="request-filter-select-trigger"
                  aria-labelledby="request-type-filter-label"
                  aria-haspopup="listbox"
                  aria-expanded={filterOptionsOpen}
                  aria-controls="request-type-filter-options"
                  onClick={() => setFilterOptionsOpen((open) => !open)}
                >
                  <span>{filterLabels[filterDraft]}</span>
                  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </button>
                {filterOptionsOpen && (
                  <div className="request-filter-options" id="request-type-filter-options" role="listbox" aria-labelledby="request-type-filter-label">
                    {[
                      ['all', 'Todas las solicitudes'],
                      ['nuevo_ingreso', 'Nuevo ingreso'],
                      ['preinscripcion', 'Preinscripción existente']
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="option"
                        aria-selected={filterDraft === value}
                        className={filterDraft === value ? 'is-selected' : ''}
                        onClick={() => {
                          setFilterDraft(value)
                          setFilterOptionsOpen(false)
                        }}
                      >
                        <span>{label}</span>
                        {filterDraft === value && (
                          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                            <path d="m4 10 4 4 8-8" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="request-filter-current">
                Filtro actual: <strong>{filterLabels[requestFilter]}</strong>
              </span>
              <div className="request-filter-actions">
                <CircularActionButton
                  action="close"
                  className="request-filter-cancel"
                  label="Cerrar sin aplicar el filtro"
                  title="Cerrar sin aplicar el filtro"
                  onClick={() => {
                    setFilterOptionsOpen(false)
                    setFilterModalOpen(false)
                  }}
                />
                <CircularActionButton
                  action="apply"
                  className="request-filter-apply"
                  label="Aplicar filtro"
                  title="Aplicar filtro"
                  type="submit"
                />
              </div>
            </form>
          </section>
        </div>
      )}

      {approvalSolicitud && canApprove && (
        <div className="modal-overlay request-review-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !approving) setApprovalSolicitud(null)
        }}>
          <section className="modal-card request-review-modal" role="dialog" aria-modal="true" aria-labelledby="request-review-title">
            <div className="request-review-header">
              <span className="management-eyebrow">REVISIÓN DE ADMISIÓN · SOLICITUD #{approvalSolicitud.id}</span>
              <h3 id="request-review-title">Revisar e inscribir alumno</h3>
              <p>{isExistingStudentApproval
                ? 'Revisa el cambio de grado y asigna la sección. Se conservarán los datos y documentos actuales del alumno.'
                : 'Revisa la información y define la sección, el estado y el movimiento de los documentos.'}</p>
            </div>
            <div className="request-review-body">
              <div className="request-review-grid">
                {visibleDetailRows.map(([label, value]) => (
                  <div className="request-review-detail" key={label}>
                    <span>{label}</span>
                    <strong>{value || 'No indicado'}</strong>
                  </div>
                ))}
              </div>
              <div className="request-review-side">
                <div className="request-review-selects">
                  <label className="request-review-section-select">
                    Sección · {approvalGrade?.nombre_grado || approvalDetails.grado_nombre || 'Grado'}
                    <select
                      value={approvalSectionId}
                      onChange={(event) => setApprovalSectionId(event.target.value)}
                      required
                      disabled={loadingApprovalCatalogs || approvalSections.length === 0}
                    >
                      <option value="">
                        {loadingApprovalCatalogs
                          ? 'Cargando secciones...'
                          : approvalSections.length
                            ? 'Selecciona una sección'
                            : 'Sin secciones disponibles'}
                      </option>
                      {approvalSections.map((section) => (
                        <option key={section.id_seccion} value={String(section.id_seccion)}>
                          {section.nombre_seccion}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!isExistingStudentApproval && <>
                    <label className="request-review-section-select">
                      Estado del documento
                      <select
                        value={approvalStatusId}
                        onChange={(event) => setApprovalStatusId(event.target.value)}
                        required
                        disabled={loadingApprovalCatalogs || approvalDocumentCatalogs.statuses.length === 0}
                      >
                        <option value="">{loadingApprovalCatalogs ? 'Cargando estados...' : 'Selecciona un estado'}</option>
                        {approvalDocumentCatalogs.statuses.map((status) => (
                          <option key={status.id_status} value={String(status.id_status)}>
                            {status.nombre_status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="request-review-section-select">
                      Movimiento del documento
                      <select
                        value={approvalMovementId}
                        onChange={(event) => setApprovalMovementId(event.target.value)}
                        required
                        disabled={loadingApprovalCatalogs || approvalDocumentCatalogs.movements.length === 0}
                      >
                        <option value="">{loadingApprovalCatalogs ? 'Cargando movimientos...' : 'Selecciona un movimiento'}</option>
                        {approvalDocumentCatalogs.movements.map((movement) => (
                          <option key={movement.id_movimiento} value={String(movement.id_movimiento)}>
                            {movement.nombre_movimiento}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>}
                </div>
                {!isExistingStudentApproval && <div className="request-review-files">
                  <h4>Documentos adjuntos</h4>
                  {attachmentRows.map(([label, file]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{file?.originalname
                        ? `${file.originalname} · ${Math.ceil(Number(file.size || 0) / 1024)} KB`
                        : label === 'Cédula del alumno' ? 'No posee cédula' : 'Sin archivo'}</strong>
                    </div>
                  ))}
                </div>}
              </div>
            </div>
            {approvalError && <p className="form-error request-review-error" role="alert">{approvalError}</p>}
            <div className="request-review-actions">
              <CircularActionButton action="approve" label={approving ? 'Registrando inscripción' : 'Aprobar e inscribir'} title={approving ? 'Registrando inscripción' : 'Aprobar e inscribir'} onClick={handleApprove} disabled={!canApprove || approving || loadingApprovalCatalogs} />
              <CircularActionButton action="exit" label="Salir del modal" title="Salir del modal" onClick={() => setApprovalSolicitud(null)} disabled={approving} />
            </div>
          </section>
        </div>
      )}
      </>}
    </div>
  )
}
