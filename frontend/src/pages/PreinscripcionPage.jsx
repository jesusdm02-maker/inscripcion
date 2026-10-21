import React, { useEffect, useRef, useState } from 'react'
import {
  createAdminInscripcion,
  createExistingStudentPreinscripcion,
  createRepresentativePreinscripcion,
  fetchRepresentativePreinscriptionStudents,
  fetchCatalogos,
  searchAlumnosForPreinscripcion
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import CircularActionButton from '../components/CircularActionButton'
import { hasPermission } from '../utils/permissions'

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

const emptyForm = {
  nombres: '',
  apellidos: '',
  fecha_nacimiento: '',
  alergias_condiciones: '',
  documento: '',
  representante_cedula: '',
  representante_nombre: '',
  representante_apellido: '',
  representante_parentesco: '',
  telefono: '',
  correo: '',
  direccion_municipio: '',
  direccion_calle: '',
  direccion_avenida: '',
  direccion_num_casa: '',
  alumno_id: '',
  grado_actual: '',
  grado_actual_id: '',
  grado_id: '',
  grado_nombre: '',
  periodo_id: '',
  fecha_inicio: '',
  foto_cedula: null,
  foto_alumno: null
}

export default function PreinscripcionPage({
  onCancel,
  onSubmitted,
  modalMode = false,
  standaloneModalStyle = false,
  existingStudentMode = false,
  formPurpose = 'nuevo-ingreso'
}) {
  const { user } = useAuth()
  const isRepresentative = String(user?.role || user?.rol || '').trim().toLocaleLowerCase('es') === 'representante'
  const representativePreinscriptionMode = isRepresentative && formPurpose === 'preinscripcion'
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [successSolicitud, setSuccessSolicitud] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [gradoOptions, setGradoOptions] = useState([])
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [studentSearch, setStudentSearch] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [searchingStudents, setSearchingStudents] = useState(false)
  const [studentSearchError, setStudentSearchError] = useState('')
  const [representativeCedula, setRepresentativeCedula] = useState('')
  const [representativeStudents, setRepresentativeStudents] = useState([])
  const [selectedRepresentativeStudent, setSelectedRepresentativeStudent] = useState(null)
  const [representativeStudentModalOpen, setRepresentativeStudentModalOpen] = useState(false)
  const [loadingRepresentativeStudents, setLoadingRepresentativeStudents] = useState(false)
  const [representativeStudentsLoaded, setRepresentativeStudentsLoaded] = useState(false)
  const [representativeStudentsError, setRepresentativeStudentsError] = useState('')
  const [representativeGradeMenuOpen, setRepresentativeGradeMenuOpen] = useState(false)
  const representativeGradeMenuRef = useRef(null)

  useEffect(() => {
    const loadCatalogos = async () => {
      try {
        const data = await fetchCatalogos()
        setGradoOptions(data.grados || [])
      } catch (err) {
        setCatalogError('No se pudieron cargar los grados y períodos. Revisa la conexión e inténtalo de nuevo.')
      }
    }

    loadCatalogos()
  }, [])

  useEffect(() => {
    if (!representativeGradeMenuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!representativeGradeMenuRef.current?.contains(event.target)) {
        setRepresentativeGradeMenuOpen(false)
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setRepresentativeGradeMenuOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [representativeGradeMenuOpen])

  useEffect(() => {
    if (!existingStudentMode) return undefined
    const query = studentSearch.trim()
    if (query.length < 2) {
      setStudentResults([])
      setStudentSearchError('')
      setSearchingStudents(false)
      return undefined
    }

    let active = true
    const timeout = window.setTimeout(async () => {
      setSearchingStudents(true)
      setStudentSearchError('')
      try {
        const results = await searchAlumnosForPreinscripcion(query)
        if (active) setStudentResults(results)
      } catch (err) {
        if (active) {
          setStudentResults([])
          setStudentSearchError(err.response?.data?.error || 'No se pudieron buscar alumnos registrados.')
        }
      } finally {
        if (active) setSearchingStudents(false)
      }
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [existingStudentMode, studentSearch])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm(prev => {
      const next = { ...prev, [name]: value }

      if (name === 'grado_nombre') {
        const nextGrade = gradoOptions.find((grade) => String(grade.id) === value)
        next.grado_id = nextGrade?.id || ''
        next.grado_nombre = nextGrade?.nombre_grado || ''
      }

      return next
    })
  }

  const handleFileChange = (event) => {
    const { name, files } = event.target
    const file = files && files[0] ? files[0] : null
    if (file && file.size > MAX_IMAGE_SIZE_BYTES) {
      setError('Cada imagen debe pesar como máximo 5 MB. Reduce el tamaño de la foto e inténtalo de nuevo.')
      event.target.value = ''
      setForm(prev => ({ ...prev, [name]: null }))
      return
    }
    setError('')
    setForm(prev => ({
      ...prev,
      [name]: file
    }))
  }

  const handleFindRepresentativeStudents = async () => {
    const cedula = representativeCedula.trim()
    if (!cedula || cedula.length > 20) {
      setRepresentativeStudentsError('Escribe una cédula válida del representante.')
      return
    }
    setLoadingRepresentativeStudents(true)
    setRepresentativeStudentsError('')
    setRepresentativeStudents([])
    setSelectedRepresentativeStudent(null)
    setRepresentativeStudentsLoaded(false)
    setForm((current) => ({ ...current, alumno_id: '', grado_id: '', grado_nombre: '' }))
    try {
      const students = await fetchRepresentativePreinscriptionStudents(cedula, user?.role, user?.id)
      setRepresentativeStudents(students)
      setRepresentativeStudentsLoaded(true)
    } catch (err) {
      setRepresentativeStudentsError(err.response?.data?.error || 'No se pudieron consultar los alumnos asociados a esta cédula.')
    } finally {
      setLoadingRepresentativeStudents(false)
    }
  }

  const selectedGrade = gradoOptions.find((grade) => String(grade.id) === String(form.grado_id))
  const currentRepresentativeGradeIndex = representativePreinscriptionMode
    ? gradoOptions.findIndex((grade) => String(grade.id) === String(selectedRepresentativeStudent?.grado_actual_id))
    : -1
  const representativeGradeOptions = currentRepresentativeGradeIndex >= 0
    ? gradoOptions.filter((grade, index) => {
      if (index === currentRepresentativeGradeIndex) return true
      if (index < currentRepresentativeGradeIndex) return false
      return (grade.cupos_disponibles === null || Number(grade.cupos_disponibles) > 0) &&
        Boolean(grade.secciones?.length)
    })
    : []
  const stepCount = representativePreinscriptionMode ? 1 : existingStudentMode ? 2 : 4
  const isPreinscripcionForm = formPurpose === 'preinscripcion'
  const steps = representativePreinscriptionMode
    ? [{ number: 1, label: 'Solicitud' }]
    : existingStudentMode
    ? [{ number: 1, label: 'Alumno' }, { number: 2, label: 'Grado' }]
    : [
        { number: 1, label: 'Alumno' },
        { number: 2, label: 'Representante' },
        { number: 3, label: 'Académico' },
        { number: 4, label: 'Documentos' }
      ]

  const hasSeatLimit = selectedGrade?.cupos_disponibles !== null && selectedGrade?.cupos_disponibles !== undefined
  const availableSeats = hasSeatLimit ? Number(selectedGrade.cupos_disponibles) : null
  const gradeAvailabilityMessage = selectedGrade
    ? !hasSeatLimit
      ? 'No se definió un límite de cupos para este grado.'
      : availableSeats > 0
      ? `${availableSeats} cupos disponibles`
      : 'Este grado no tiene cupos disponibles.'
    : ''

  const validateStep = (currentStep = step) => {
    if (representativePreinscriptionMode) {
      if (currentStep === 1 && !representativeCedula.trim()) {
        return 'Escribe la cédula del representante.'
      }
      if (currentStep === 1 && !selectedRepresentativeStudent) {
        return 'Busca y selecciona uno de tus alumnos registrados.'
      }
      if (currentStep === 1 && !selectedGrade) {
        return 'Selecciona el grado al que pasará el estudiante.'
      }
      if (currentStep === 1 && hasSeatLimit && availableSeats <= 0) {
        return 'El grado seleccionado no tiene cupos disponibles.'
      }
      if (currentStep === 1 && !selectedGrade?.secciones?.length) {
        return 'El grado seleccionado no tiene secciones disponibles.'
      }
      return ''
    }
    if (existingStudentMode) {
      if (currentStep === 1 && !form.alumno_id) {
        return 'Busca y selecciona un alumno registrado.'
      }
      if (currentStep === 2 && (
        !selectedGrade ||
        (hasSeatLimit && availableSeats <= 0) ||
        !selectedGrade.secciones?.length
      )) {
        return 'Selecciona un grado con cupos y secciones disponibles.'
      }
      return ''
    }

    const requiredFields = {
      1: ['nombres', 'apellidos', 'fecha_nacimiento', 'documento', 'alergias_condiciones'],
      2: [
        'representante_cedula',
        'representante_nombre',
        'representante_apellido',
        'representante_parentesco',
        'telefono',
        'correo',
        'direccion_municipio',
        'direccion_calle',
        'direccion_avenida',
        'direccion_num_casa'
      ],
      3: ['grado_nombre', 'fecha_inicio'],
      4: ['foto_cedula']
    }

    const fields = requiredFields[currentStep] || []

    if (currentStep === 2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())) {
      return 'Ingresa un correo electrónico válido para el representante.'
    }

    if (currentStep === 3 && (
      !selectedGrade ||
      (hasSeatLimit && availableSeats <= 0) ||
      !selectedGrade.secciones?.length
    )) {
      return 'Selecciona un grado con cupos y secciones disponibles.'
    }
    for (const field of fields) {
      const value = form[field]
      if (value === null || value === undefined || String(value).trim() === '') {
        const labels = {
          nombres: 'nombres',
          apellidos: 'apellidos',
          fecha_nacimiento: 'fecha de nacimiento',
          representante_cedula: 'cédula del representante',
          representante_nombre: 'nombre del representante',
          representante_apellido: 'apellido del representante',
          representante_parentesco: 'parentesco',
          alergias_condiciones: 'alergias o condiciones médicas (escribe "Ninguna" si no aplica)',
          direccion_municipio: 'municipio de residencia',
          direccion_calle: 'calle de residencia',
          direccion_avenida: 'avenida de residencia',
          direccion_num_casa: 'número de casa',
          fecha_inicio: 'período de ingreso',
          grado_nombre: 'nombre del grado'
        }
        return `Completa el campo "${labels[field] || field}" antes de continuar.`
      }
    }

    return ''
  }

  const handleNext = () => {
    const validationMessage = validateStep()
    if (validationMessage) {
      setError(validationMessage)
      setMessage('')
      return
    }

    setError('')
    setStep((prev) => Math.min(prev + 1, stepCount))
  }

  const handlePrevious = () => {
    setError('')
    setStep((prev) => Math.max(prev - 1, 1))
  }

  const hasAccessToPreinscripcion = isRepresentative
    ? hasPermission(user, 'Nuevo ingreso', 'Crear') ||
      hasPermission(user, 'Preinscripciones', 'Crear')
    : hasPermission(user, 'Preinscripciones', 'Crear') &&
      hasPermission(user, 'Alumnos', 'Crear') &&
      hasPermission(user, 'Representantes', 'Crear')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!hasAccessToPreinscripcion) return

    for (let validationStep = 1; validationStep <= stepCount; validationStep += 1) {
      const validationMessage = validateStep(validationStep)
      if (validationMessage) {
        setStep(validationStep)
        setError(validationMessage)
        setMessage('')
        return
      }
    }

    setSubmitting(true)
    try {
      if (representativePreinscriptionMode) {
        const solicitud = await createRepresentativePreinscripcion({
          representante_cedula: representativeCedula.trim(),
          alumno_id: Number(selectedRepresentativeStudent.id),
          grado_id: Number(form.grado_id)
        }, user?.role, user?.id)
        setSuccessSolicitud(solicitud)
        setError('')
        setRepresentativeCedula('')
        setRepresentativeStudents([])
        setSelectedRepresentativeStudent(null)
        setRepresentativeStudentModalOpen(false)
        setRepresentativeStudentsLoaded(false)
        setRepresentativeStudentsError('')
        setStep(1)
        setForm({ ...emptyForm })
        return
      }
      if (existingStudentMode) {
        const solicitud = await createExistingStudentPreinscripcion({
          alumno_id: Number(form.alumno_id),
          grado_id: Number(form.grado_id)
        }, user?.role, user?.id)
        setSuccessSolicitud(solicitud)
        onSubmitted?.()
        setError('')
        setStep(1)
        setForm({ ...emptyForm })
        setStudentSearch('')
        setStudentResults([])
        setSelectedStudent(null)
        return
      }

      const payload = new FormData()

      Object.entries(form).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          return
        }

        if (value instanceof File) {
          payload.append(key, value)
          return
        }

        payload.append(key, String(value))
      })

      const solicitud = await createAdminInscripcion(payload, user?.role, user?.id)
      setSuccessSolicitud(solicitud)
      onSubmitted?.()
      setMessage('')
      setError('')
      setStep(1)
      setForm({ ...emptyForm })
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la preinscripción')
      setMessage('')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user || !hasAccessToPreinscripcion) {
    return <div className="page-content"><p>Acceso restringido a usuarios con permiso de Preinscripción.</p></div>
  }

  const renderStep = () => {
    if (representativePreinscriptionMode) {
      return (
        <div className="preinscripcion-section">
          <div className="preinscripcion-section-heading">
            <span>01</span>
            <div>
              <h3>Solicitud de preinscripción</h3>
              <p>Escribe la cédula del representante para consultar los alumnos asociados a tu cuenta y seleccionar a quien solicitará un cambio de grado.</p>
            </div>
          </div>
          <div className="representative-preinscription-lookup">
            <label className="representative-cedula-label" htmlFor="representative-cedula">
              Cédula del representante
            </label>
            <div className="representative-cedula-control-row">
              <input
                id="representative-cedula"
                value={representativeCedula}
                disabled={loadingRepresentativeStudents}
                onChange={(event) => {
                  setRepresentativeCedula(event.target.value)
                  setRepresentativeStudents([])
                  setSelectedRepresentativeStudent(null)
                  setRepresentativeStudentsLoaded(false)
                  setRepresentativeStudentsError('')
                  setForm((current) => ({ ...current, alumno_id: '', grado_id: '', grado_nombre: '' }))
                }}
                maxLength={20}
                autoComplete="off"
                placeholder="Escribe la cédula del representante"
                aria-describedby="representative-cedula-help"
              />
              <button
                type="button"
                className="primary-button representative-preinscription-search"
                onClick={handleFindRepresentativeStudents}
                disabled={loadingRepresentativeStudents || !representativeCedula.trim()}
                aria-label={loadingRepresentativeStudents ? 'Buscando alumnos' : 'Buscar alumnos asociados'}
                title={loadingRepresentativeStudents ? 'Buscando alumnos' : 'Buscar alumnos asociados'}
                aria-busy={loadingRepresentativeStudents}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="10.8" cy="10.2" r="5.8" />
                  <path d="M15.2 14.6 20 19.4M10.8 7.5a2.2 2.2 0 0 0-2.2 2.2M8 13.3c.7-.9 1.7-1.3 2.8-1.3" />
                </svg>
              </button>
            </div>
            <div className="representative-cedula-help">
              <small id="representative-cedula-help">Debe coincidir con la cédula registrada en tu perfil.</small>
            </div>
          </div>
          {representativeStudentsError && <p className="form-error" role="alert">{representativeStudentsError}</p>}
          {loadingRepresentativeStudents && <p className="management-state">Consultando los alumnos asociados...</p>}
          {representativeStudentsLoaded && representativeStudents.length === 0 && !representativeStudentsError && (
            <p className="management-state">No hay alumnos inscritos asociados a esta cédula.</p>
          )}
          {representativeStudents.length > 0 && !selectedRepresentativeStudent && (
            <div className="representative-student-options" role="list" aria-label="Alumnos asociados al representante">
              {representativeStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  className="representative-student-option"
                  onClick={() => {
                    setSelectedRepresentativeStudent(student)
                    setRepresentativeStudentModalOpen(true)
                    setForm((current) => ({ ...current, alumno_id: String(student.id), grado_id: '', grado_nombre: '' }))
                    setError('')
                  }}
                >
                  <span className="representative-student-option-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
                    </svg>
                  </span>
                  <span className="representative-student-option-copy">
                    <strong>{student.nombres} {student.apellidos}</strong>
                    <small>{student.documento || `Registro #${student.id}`} · Grado actual: {student.grado_actual || 'No indicado'}</small>
                  </span>
                  <span className="representative-student-option-arrow" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}
          {selectedRepresentativeStudent && representativeStudentModalOpen && (
            <div
              className="modal-overlay representative-student-modal-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting) {
                  setRepresentativeStudentModalOpen(false)
                  setSelectedRepresentativeStudent(null)
                  setForm((current) => ({ ...current, alumno_id: '', grado_id: '', grado_nombre: '' }))
                  setError('')
                }
              }}
            >
              <section
                className="modal-card representative-student-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="representative-student-modal-title"
              >
                <header className="representative-student-modal-header">
                  <div>
                    <span className="management-eyebrow">SOLICITUD DE PREINSCRIPCIÓN</span>
                    <h3 id="representative-student-modal-title">Revisa los datos del alumno</h3>
                    <p>Confirma la información y el grado solicitado antes de enviar.</p>
                  </div>
                </header>
                <div className="representative-student-modal-content">
                  <section className="representative-student-modal-section" aria-labelledby="representative-student-data-title">
                    <h4 id="representative-student-data-title">Datos del alumno</h4>
                    <dl className="representative-student-details">
                      <div><dt>Nombres y apellidos</dt><dd>{[selectedRepresentativeStudent.nombres, selectedRepresentativeStudent.apellidos].filter(Boolean).join(' ') || 'No indicado'}</dd></div>
                      <div><dt>Cédula</dt><dd>{selectedRepresentativeStudent.documento || 'No indicada'}</dd></div>
                      <div><dt>Fecha de nacimiento</dt><dd>{selectedRepresentativeStudent.fecha_nacimiento ? String(selectedRepresentativeStudent.fecha_nacimiento).slice(0, 10) : 'No indicada'}</dd></div>
                      <div><dt>Alergias o condiciones</dt><dd>{selectedRepresentativeStudent.alergias_condiciones || 'No indicadas'}</dd></div>
                      <div><dt>Grado actual</dt><dd>{selectedRepresentativeStudent.grado_actual || 'No indicado'}</dd></div>
                      <div><dt>Período actual</dt><dd>{selectedRepresentativeStudent.periodo || 'No indicado'}</dd></div>
                    </dl>
                  </section>
                  <section className="representative-student-modal-section" aria-labelledby="representative-contact-data-title">
                    <h4 id="representative-contact-data-title">Datos de contacto</h4>
                    <dl className="representative-student-details">
                      <div><dt>Representante</dt><dd>{selectedRepresentativeStudent.representante || 'No indicado'}</dd></div>
                      <div><dt>Cédula del representante</dt><dd>{selectedRepresentativeStudent.representante_cedula || 'No indicada'}</dd></div>
                      <div><dt>Parentesco</dt><dd>{selectedRepresentativeStudent.representante_parentesco || 'No indicado'}</dd></div>
                      <div><dt>Teléfono</dt><dd>{selectedRepresentativeStudent.telefono || 'No indicado'}</dd></div>
                      <div><dt>Correo</dt><dd>{selectedRepresentativeStudent.correo || 'No indicado'}</dd></div>
                      <div><dt>Dirección</dt><dd>{[
                          selectedRepresentativeStudent.direccion_calle,
                          selectedRepresentativeStudent.direccion_avenida,
                          selectedRepresentativeStudent.direccion_num_casa,
                          selectedRepresentativeStudent.direccion_municipio
                        ].filter(Boolean).join(', ') || 'No indicada'}</dd></div>
                    </dl>
                  </section>
                  <div className="representative-student-grade" ref={representativeGradeMenuRef}>
                    <span className="representative-student-grade-label">Grado al que pasará</span>
                    <button
                      type="button"
                      className={`representative-grade-select-trigger${selectedGrade ? ' has-value' : ''}`}
                      aria-haspopup="listbox"
                      aria-expanded={representativeGradeMenuOpen}
                      aria-controls="representative-grade-options"
                      onClick={() => setRepresentativeGradeMenuOpen((open) => !open)}
                    >
                      <span>
                        <small>GRADO SOLICITADO</small>
                        <strong>{selectedGrade?.nombre_grado || 'Selecciona el grado solicitado'}</strong>
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="m7 10 5 5 5-5" />
                      </svg>
                    </button>
                    {representativeGradeMenuOpen && (
                      <div
                        className="representative-grade-options"
                        id="representative-grade-options"
                        role="listbox"
                        aria-label="Grados disponibles"
                      >
                        {representativeGradeOptions.map((grade) => {
                          const isCurrentGrade = String(grade.id) === String(selectedRepresentativeStudent.grado_actual_id)
                          const isFull = grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0
                          const hasNoSections = !grade.secciones?.length
                          const isUnavailable = isCurrentGrade || isFull || hasNoSections
                          return (
                            <button
                              key={grade.id}
                              type="button"
                              role="option"
                              aria-selected={String(grade.id) === String(form.grado_id)}
                              className="representative-grade-option"
                              disabled={isUnavailable}
                              onClick={() => {
                                setForm((current) => ({
                                  ...current,
                                  grado_id: grade.id,
                                  grado_nombre: grade.nombre_grado
                                }))
                                setRepresentativeGradeMenuOpen(false)
                                setError('')
                              }}
                            >
                              <span className="representative-grade-option-copy">
                                <strong>{grade.nombre_grado}</strong>
                                <small>{isCurrentGrade
                                  ? 'Grado actual'
                                  : hasNoSections
                                    ? 'Sin secciones disponibles'
                                    : isFull
                                      ? 'Sin cupos disponibles'
                                      : grade.cupos_disponibles === null
                                        ? 'Cupo sin límite'
                                        : `${Number(grade.cupos_disponibles)} cupos disponibles`}
                                </small>
                              </span>
                              <span className={`representative-grade-option-status${isUnavailable ? ' is-unavailable' : ''}`}>
                                {isCurrentGrade ? 'Actual' : isUnavailable ? 'No disponible' : 'Disponible'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {gradeAvailabilityMessage && (
                    <p className={`capacity-message ${!hasSeatLimit || availableSeats > 0 ? 'is-available' : 'is-full'}`}>
                      {gradeAvailabilityMessage}
                    </p>
                  )}
                  {error && <p className="form-error" role="alert">{error}</p>}
                </div>
                <footer className="representative-student-modal-actions">
                  <CircularActionButton
                    action="close"
                    onClick={() => {
                      setRepresentativeStudentModalOpen(false)
                      setSelectedRepresentativeStudent(null)
                      setForm((current) => ({ ...current, alumno_id: '', grado_id: '', grado_nombre: '' }))
                      setError('')
                    }}
                    disabled={submitting}
                    label="Cancelar solicitud de preinscripción"
                    title="Cancelar"
                    className="representative-student-modal-cancel"
                  />
                  <CircularActionButton
                    action="submit"
                    type="submit"
                    disabled={submitting || Boolean(catalogError)}
                    label={submitting ? 'Enviando solicitud' : 'Enviar solicitud de preinscripción'}
                    title={submitting ? 'Enviando solicitud' : 'Enviar solicitud'}
                    className="representative-student-modal-submit"
                  />
                </footer>
              </section>
            </div>
          )}
        </div>
      )
    }
    if (existingStudentMode) {
      if (step === 1) {
        return (
          <div className="preinscripcion-section">
            <div className="preinscripcion-section-heading">
              <span>01</span>
              <div>
                <h3>Busca al alumno registrado</h3>
                <p>Selecciona al alumno cuya inscripción deseas solicitar. Sus datos personales no se modificarán.</p>
              </div>
            </div>
            <label className="preinscripcion-student-search">
              Buscar por nombre, apellido, cédula o número de registro
              <input
                type="search"
                value={studentSearch}
                onChange={(event) => {
                  setStudentSearch(event.target.value)
                  setSelectedStudent(null)
                  setForm((current) => ({ ...current, alumno_id: '' }))
                }}
                autoComplete="off"
                aria-describedby="preinscripcion-student-search-help"
                placeholder="Escribe nombre, cédula o número de registro"
              />
              <small id="preinscripcion-student-search-help">
                Escribe el nombre o apellido, la cédula o el número de registro del alumno.
              </small>
            </label>
            {studentSearchError && <p className="form-error" role="alert">{studentSearchError}</p>}
            {searchingStudents && <p className="management-state">Buscando alumnos...</p>}
            {!searchingStudents && studentSearch.trim().length >= 2 && studentResults.length === 0 && !studentSearchError && (
              <p className="management-state">No se encontraron alumnos registrados con esos datos.</p>
            )}
            {!selectedStudent && studentResults.length > 0 && (
              <div className="preinscripcion-student-results" role="listbox" aria-label="Alumnos encontrados">
                {studentResults.map((student) => (
                  <button
                    className="preinscripcion-student-result"
                    key={student.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    disabled={!student.periodo_id}
                    onClick={() => {
                      setSelectedStudent(student)
                      setForm((current) => ({
                        ...current,
                        alumno_id: String(student.id),
                        nombres: student.nombres || '',
                        apellidos: student.apellidos || '',
                        documento: student.documento || '',
                        fecha_nacimiento: student.fecha_nacimiento || '',
                        alergias_condiciones: student.alergias_condiciones || '',
                        representante_nombre: student.representante_nombre || '',
                        representante_apellido: student.representante_apellido || '',
                        representante_cedula: student.representante_cedula || '',
                        representante_parentesco: student.representante_parentesco || '',
                        telefono: student.telefono || '',
                        correo: student.correo || '',
                        direccion_municipio: student.direccion_municipio || '',
                        direccion_calle: student.direccion_calle || '',
                        direccion_avenida: student.direccion_avenida || '',
                        direccion_num_casa: student.direccion_num_casa || '',
                        grado_actual_id: student.grado_actual_id || '',
                        grado_actual: student.grado_actual || '',
                        periodo_id: student.periodo_id || '',
                        fecha_inicio: student.periodo || ''
                      }))
                      setError('')
                    }}
                  >
                    <strong>{student.nombres} {student.apellidos}</strong>
                    <span>{student.documento || `Registro #${student.id}`} · Grado actual: {student.grado_actual || 'No indicado'}</span>
                    {!student.periodo_id && <small>No tiene un período de inscripción actual para conservar.</small>}
                  </button>
                ))}
              </div>
            )}
            {selectedStudent && (
              <div className="preinscripcion-selected-student" role="status">
                <strong>{selectedStudent.nombres} {selectedStudent.apellidos}</strong>
                <span>{selectedStudent.documento || `Registro #${selectedStudent.id}`}</span>
                <span>Grado actual: {selectedStudent.grado_actual || 'No indicado'}</span>
                <button type="button" onClick={() => {
                  setSelectedStudent(null)
                  setForm((current) => ({ ...current, alumno_id: '' }))
                }}>Cambiar alumno</button>
              </div>
            )}
          </div>
        )
      }

      return (
        <div className="preinscripcion-section">
          <div className="preinscripcion-section-heading">
            <span>02</span>
            <div>
              <h3>Grado solicitado</h3>
              <p>El período actual del alumno se conservará. La sección será asignada por el administrador al aprobar la solicitud.</p>
            </div>
          </div>
          {selectedStudent && (
            <div className="preinscripcion-selected-summary">
              <span>Alumno</span>
              <strong>{selectedStudent.nombres} {selectedStudent.apellidos}</strong>
              <span>Grado actual</span>
              <strong>{selectedStudent.grado_actual || 'No indicado'}</strong>
              <span>Período que se conservará</span>
              <strong>{selectedStudent.periodo || 'No indicado'}</strong>
            </div>
          )}
          <div className="section-row two-columns">
            <label>
              Nuevo grado solicitado
              <select name="grado_nombre" value={String(form.grado_id || '')} onChange={handleChange} required>
                <option value="">Selecciona el nuevo grado solicitado</option>
                {gradoOptions.map((grade) => (
                  <option
                    key={grade.id}
                    value={String(grade.id)}
                    disabled={String(grade.id) === String(selectedStudent?.grado_actual_id) ||
                      (grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) ||
                      !grade.secciones?.length}
                  >
                    {grade.nombre_grado} · {String(grade.id) === String(selectedStudent?.grado_actual_id)
                      ? 'grado actual'
                      : !grade.secciones?.length
                        ? 'sin secciones disponibles'
                        : grade.cupos_disponibles === null
                          ? 'cupo sin límite'
                          : `${Number(grade.cupos_disponibles)} cupos`}
                  </option>
                ))}
              </select>
            </label>
            <div className="preinscripcion-capacity" aria-live="polite">
              <span>Cupos del grado</span>
              <strong>{selectedGrade ? (hasSeatLimit ? availableSeats : '—') : '—'}</strong>
              <small>{!selectedGrade ? 'Selecciona un grado' : hasSeatLimit ? 'cupos disponibles al elegir' : 'sin límite configurado'}</small>
            </div>
          </div>
          {gradeAvailabilityMessage && (
            <p className={`capacity-message ${!hasSeatLimit || availableSeats > 0 ? 'is-available' : 'is-full'}`}>
              {gradeAvailabilityMessage}
            </p>
          )}
        </div>
      )
    }

    if (step === 1) {
      return (
        <div className="preinscripcion-section">
          <div className="preinscripcion-section-heading">
            <span>01</span>
            <div>
              <h3>Datos del alumno</h3>
              <p>Identificación y datos básicos del aspirante.</p>
            </div>
          </div>
          <div className="section-row two-columns">
            <label>
              Nombres
              <input name="nombres" value={form.nombres ?? ''} onChange={handleChange} maxLength={100} autoComplete="given-name" placeholder="Escribe los nombres del alumno" required />
            </label>
            <label>
              Apellidos
              <input name="apellidos" value={form.apellidos ?? ''} onChange={handleChange} maxLength={100} autoComplete="family-name" placeholder="Escribe los apellidos del alumno" required />
            </label>
          </div>
          <div className="section-row two-columns">
            <label>
              Fecha de nacimiento
              <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento ?? ''} onChange={handleChange} required />
            </label>
            <label>
              Documento de identidad del alumno
              <input name="documento" value={form.documento ?? ''} onChange={handleChange} maxLength={100} autoComplete="off" placeholder="Escribe el documento de identidad del alumno" required />
            </label>
          </div>
          <div className="section-row">
            <label>
              Alergias y condiciones médicas del alumno
              <textarea name="alergias_condiciones" value={form.alergias_condiciones ?? ''} onChange={handleChange} placeholder="Indica las alergias o condiciones médicas" rows="3" required />
            </label>
          </div>
        </div>
      )
    }

    if (step === 2) {
      return (
        <div className="preinscripcion-section">
          <div className="preinscripcion-section-heading">
            <span>02</span>
            <div>
              <h3>Datos del representante</h3>
              <p>Información de contacto y domicilio del responsable.</p>
            </div>
          </div>
          <div className="section-row two-columns">
            <label>
              Nombre(s) del representante
              <input name="representante_nombre" value={form.representante_nombre ?? ''} onChange={handleChange} maxLength={75} autoComplete="given-name" placeholder="Escribe los nombres del representante" required />
            </label>
            <label>
              Apellido(s) del representante
              <input name="representante_apellido" value={form.representante_apellido ?? ''} onChange={handleChange} maxLength={75} autoComplete="family-name" placeholder="Escribe los apellidos del representante" required />
            </label>
          </div>
          <div className="section-row two-columns">
            <label>
              Cédula del representante
              <input name="representante_cedula" value={form.representante_cedula ?? ''} onChange={handleChange} maxLength={20} autoComplete="off" placeholder="Escribe la cédula del representante" required />
            </label>
            <label>
              Parentesco
              <input name="representante_parentesco" value={form.representante_parentesco ?? ''} onChange={handleChange} maxLength={50} placeholder="Indica el parentesco con el alumno" required />
            </label>
          </div>
          <div className="section-row two-columns">
            <label>
              Número de teléfono del representante
              <input type="tel" name="telefono" value={form.telefono ?? ''} onChange={handleChange} maxLength={50} autoComplete="tel" placeholder="Escribe el teléfono del representante" required />
            </label>
            <label>
              Correo electrónico del representante
              <input type="email" name="correo" value={form.correo ?? ''} onChange={handleChange} autoComplete="email" placeholder="Escribe el correo del representante" required />
            </label>
          </div>
          <div className="section-row two-columns">
            <label>
              Municipio de residencia
              <input name="direccion_municipio" value={form.direccion_municipio ?? ''} onChange={handleChange} maxLength={50} autoComplete="address-level2" placeholder="Escribe el municipio de residencia" required />
            </label>
            <label>
              Avenida de residencia
              <input name="direccion_avenida" value={form.direccion_avenida ?? ''} onChange={handleChange} maxLength={50} placeholder="Escribe la avenida de residencia" required />
            </label>
          </div>
          <div className="section-row two-columns">
            <label>
              Calle de residencia
              <input name="direccion_calle" value={form.direccion_calle ?? ''} onChange={handleChange} maxLength={50} autoComplete="address-line1" placeholder="Escribe la calle de residencia" required />
            </label>
            <label>
              Número de casa
              <input name="direccion_num_casa" value={form.direccion_num_casa ?? ''} onChange={handleChange} maxLength={50} placeholder="Escribe el número de casa" required />
            </label>
          </div>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div className="preinscripcion-section">
          <div className="preinscripcion-section-heading">
            <span>03</span>
            <div>
              <h3>Selección académica</h3>
              <p>Elige el grado y período de ingreso. La sección será asignada por el administrador.</p>
            </div>
          </div>
          <div className="section-row two-columns">
            <label>
              Grado
              <select name="grado_nombre" value={String(form.grado_id || '')} onChange={handleChange} required>
                <option key="empty-grade" value="">Seleccione un grado</option>
                {gradoOptions.map((grade) => (
                  <option
                    key={grade.id}
                    value={String(grade.id)}
                    disabled={(grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) || !grade.secciones?.length}
                  >
                    {grade.nombre_grado} · {!grade.secciones?.length
                      ? 'sin secciones disponibles'
                      : grade.cupos_disponibles === null
                        ? 'cupo sin límite'
                        : `${Number(grade.cupos_disponibles)} cupos`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="section-row two-columns">
            <label>
              Período de ingreso
              <input type="date" name="fecha_inicio" value={form.fecha_inicio ?? ''} onChange={handleChange} required />
            </label>
            <div className="preinscripcion-capacity" aria-live="polite">
              <span>Cupos del grado</span>
              <strong>{selectedGrade ? (hasSeatLimit ? availableSeats : '—') : '—'}</strong>
              <small>{!selectedGrade ? 'Selecciona un grado' : hasSeatLimit ? 'cupos disponibles al elegir' : 'sin límite configurado'}</small>
            </div>
          </div>
          {gradeAvailabilityMessage && (
            <p className={`capacity-message ${!hasSeatLimit || availableSeats > 0 ? 'is-available' : 'is-full'}`}>
              {gradeAvailabilityMessage}
            </p>
          )}
          {selectedGrade && !selectedGrade.secciones?.length && (
            <p className="preinscripcion-inline-note">Este grado no tiene secciones disponibles; no se puede enviar la solicitud hasta que se configure una sección.</p>
          )}
        </div>
      )
    }

    return (
      <div className="preinscripcion-section">
        <div className="preinscripcion-section-heading">
          <span>04</span>
          <div>
            <h3>Documentos y revisión</h3>
            <p>Registra el documento presentado y su estado inicial.</p>
          </div>
        </div>
        <div className="section-row two-columns">
          <label>
            Foto de la cédula del representante
            <input type="file" name="foto_cedula" accept="image/*,.heic,.heif,.avif,.jxl,.jfif,.tif,.tiff" onChange={handleFileChange} required />
          </label>
          <label>
            Foto de la cédula del alumno
            <input type="file" name="foto_alumno" accept="image/*,.heic,.heif,.avif,.jxl,.jfif,.tif,.tiff" onChange={handleFileChange} />
            <small>Opcional. Si no tiene cédula, el registro indicará “El alumno no tiene cédula”.</small>
          </label>
        </div>
        <div className="preinscripcion-review">
          <h4>Revisa la inscripción</h4>
          <div><span>Alumno</span><strong>{`${form.nombres} ${form.apellidos}`.trim()}</strong></div>
          <div><span>Representante</span><strong>{[form.representante_nombre, form.representante_apellido].filter(Boolean).join(' ') || '—'}</strong></div>
          <div><span>Grado</span><strong>{form.grado_nombre || '—'}</strong></div>
          <div><span>Sección</span><strong>La asignará el administrador al aprobar</strong></div>
          <div><span>Período de ingreso</span><strong>{form.fecha_inicio || '—'}</strong></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`page-content preinscripcion-page${isRepresentative && !modalMode ? ' preinscripcion-page--representative' : ''}${standaloneModalStyle ? ' preinscripcion-page--standalone-modal' : ''}${existingStudentMode ? ' preinscripcion-page--existing-student' : ''}`}>
      {standaloneModalStyle && (
        <header className="preinscripcion-standalone-header">
          <div>
            <span className="management-eyebrow">{isPreinscripcionForm ? 'ADMISIÓN · PREINSCRIPCIÓN' : 'ADMISIÓN · NUEVO INGRESO'}</span>
            <h3>{isPreinscripcionForm ? 'Solicitud de preinscripción' : 'Formulario para nuevos ingresos'}</h3>
            <p>{isPreinscripcionForm
              ? 'Completa la solicitud con los datos del alumno y su representante.'
              : 'Completa los datos del alumno y su representante para formalizar el ingreso.'}</p>
          </div>
        </header>
      )}
      {!modalMode && !standaloneModalStyle && <div className="page-header">
        <span className="preinscripcion-eyebrow">ADMISIÓN · NUEVO INGRESO</span>
        <h2>Formulario para nuevos ingresos</h2>
        <p>Registra los datos del alumno y su representante para formalizar el ingreso.</p>
        {onCancel && <CircularActionButton action="previous" label="Volver a preinscripciones" title="Volver a preinscripciones" onClick={onCancel} />}
      </div>}

      <div className={standaloneModalStyle ? 'preinscripcion-standalone-content' : undefined}>
        {message && <p className="form-success preinscripcion-feedback" role="status">{message}</p>}
        {(error || catalogError) && <p className="form-error preinscripcion-feedback" role="alert">{error || catalogError}</p>}

        <div className="preinscripcion-form-card">
          <div className="preinscripcion-title-wrap">
            <div>
              <span className="preinscripcion-form-kicker">{existingStudentMode || isPreinscripcionForm ? 'SOLICITUD DE PREINSCRIPCIÓN' : 'FORMULARIO PARA NUEVOS INGRESOS'}</span>
              <h3>{existingStudentMode || isPreinscripcionForm ? 'Información del alumno' : 'Información del aspirante'}</h3>
            </div>
            <span className="preinscripcion-step-count">Paso {step} de {stepCount}</span>
          </div>

          <div className="preinscripcion-steps" aria-label="Indicador de pasos de preinscripción">
            {steps.map(({ number, label }) => (
              <div
                key={number}
                className={`step-indicator ${step === number ? 'is-active' : ''} ${step > number ? 'is-complete' : ''}`}
                aria-current={step === number ? 'step' : undefined}
              >
                <span className="step-number">{step > number ? '✓' : number}</span>
                <span className="step-name">{label}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="preinscripcion-form-grid">
            <div key={step} className="step-panel">
              {renderStep()}
            </div>

            {!representativePreinscriptionMode && (
              <div className="form-actions compact-actions preinscripcion-actions">
                {step > 1 && <CircularActionButton action="previous" label="Paso anterior" title="Paso anterior" onClick={handlePrevious} />}
                {step < stepCount ? (
                  <CircularActionButton action="next" label="Siguiente paso" title="Siguiente paso" onClick={handleNext} />
                ) : (
                  <CircularActionButton action="submit" type="submit" label={submitting ? 'Enviando preinscripción' : 'Registrar preinscripción'} title={submitting ? 'Enviando preinscripción' : 'Registrar preinscripción'} disabled={submitting || Boolean(catalogError)} />
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {successSolicitud && (
        <div className="modal-overlay preinscripcion-success-overlay" role="presentation">
          <section
            className="modal-card preinscripcion-success-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preinscripcion-success-title"
            aria-describedby="preinscripcion-success-description"
          >
            <div className="preinscripcion-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="m6.5 12.5 3.7 3.7 7.8-8.4" />
              </svg>
            </div>
            <h3 id="preinscripcion-success-title">¡Solicitud enviada!</h3>
            <p id="preinscripcion-success-description">
              {representativePreinscriptionMode
                ? 'Tu solicitud de preinscripción fue enviada correctamente. El colegio te dará una respuesta en los próximos 5 días.'
                : 'Tu solicitud de nuevo ingreso fue enviada correctamente. Espera aproximadamente 5 días para recibir una respuesta en tu correo electrónico.'}
            </p>
            <CircularActionButton
              action="exit"
              onClick={() => {
                setSuccessSolicitud(null)
                if (modalMode) onCancel?.()
              }}
              label="Cerrar mensaje"
              title="Cerrar"
              className="preinscripcion-success-close"
              autoFocus
            />
          </section>
        </div>
      )}
    </div>
  )
}
