import React, { useEffect, useState } from 'react'
import { DASHBOARD_UPDATED_EVENT, fetchDashboardSummary } from '../services/api'
import { useAuth } from '../context/AuthContext'

const numberFormat = new Intl.NumberFormat('es')

export default function DashboardSummary() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    let active = true
    let requestInProgress = false
    const loadSummary = async () => {
      if (!active || requestInProgress || document.visibilityState !== 'visible') return
      requestInProgress = true
      try {
        const data = await fetchDashboardSummary(user.role, user.id, user.accessToken)
        if (active) {
          setStats(data)
          setError('')
        }
      } catch (err) {
        if (err.response?.status === 401) return
        console.error('No se pudo actualizar el resumen del panel:', err)
        if (active) setError('No se pudo cargar el resumen. Verifica tus permisos.')
      } finally {
        requestInProgress = false
      }
    }

    loadSummary()
    const intervalId = window.setInterval(loadSummary, 5000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadSummary()
    }
    window.addEventListener('focus', loadSummary)
    window.addEventListener(DASHBOARD_UPDATED_EVENT, loadSummary)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', loadSummary)
      window.removeEventListener(DASHBOARD_UPDATED_EVENT, loadSummary)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [user?.role, user?.id, user?.accessToken])

  if (error) {
    return (
      <div className="dashboard-message dashboard-message--error" role="alert">
        <strong>No se pudo cargar el panel</strong>
        <span>{error}</span>
      </div>
    )
  }

  if (!stats) return <div className="dashboard-message">Cargando resumen...</div>

  const totalRequests = Number(stats.total_solicitudes || 0)
  const pendingRequests = Number(stats.total_solicitudes_pendientes || 0)
  const pendingNewIntake = Number(stats.total_solicitudes_pendientes_nuevo_ingreso || 0)
  const pendingPreinscriptions = Number(stats.total_solicitudes_pendientes_preinscripciones || 0)
  const processedRequests = Number(stats.total_solicitudes_procesadas || 0)
  const pendingPercent = totalRequests ? Math.round((pendingRequests / totalRequests) * 100) : 0
  const processedPercent = totalRequests ? Math.round((processedRequests / totalRequests) * 100) : 0
  const gradeRows = stats.grades || []
  const enrollmentByGrade = gradeRows.reduce((groups, row) => {
    const gradeId = row.id
    if (!groups.has(gradeId)) {
      groups.set(gradeId, {
        id: gradeId,
        nombre: row.nombre_grado,
        sections: [],
        total: 0
      })
    }

    const grade = groups.get(gradeId)
    const count = Number(row.estudiantes_inscritos || 0)
    grade.sections.push({ name: row.seccion || 'Sin sección', count })
    grade.total += count
    return groups
  }, new Map())
  const enrollmentRows = [...enrollmentByGrade.values()]
  const sectionCount = enrollmentRows.reduce((total, grade) => total + grade.sections.length, 0)

  return (
    <div className="dashboard-content">
      <section className="dashboard-metrics" aria-label="Indicadores principales">
        <Stat label="Pendientes de nuevo ingreso" value={pendingNewIntake} detail="Solicitudes por revisar" tone="amber" />
        <Stat label="Pendientes de preinscripción" value={pendingPreinscriptions} detail="Solicitudes por revisar" tone="blue" />
        <Stat label="Solicitudes recibidas" value={totalRequests} detail="Total registrado" tone="blue" />
        <Stat label="Alumnos registrados" value={stats.total_alumnos} detail="Personas en el sistema" tone="teal" />
        <Stat label="Preinscripciones registradas" value={stats.total_inscritos} detail="Proceso de ingreso" tone="green" />
      </section>

      <section className="dashboard-section dashboard-request-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-section-kicker">ADMISIÓN</span>
            <h2>Seguimiento de solicitudes</h2>
          </div>
          <span className="dashboard-total-label">{numberFormat.format(totalRequests)} en total</span>
        </div>
        <div className="request-status-list">
          <RequestStatus label="Pendientes de revisión" count={pendingRequests} total={totalRequests} percent={pendingPercent} tone="amber" />
          <RequestStatus label="Procesadas" count={processedRequests} total={totalRequests} percent={processedPercent} tone="teal" />
        </div>
      </section>

      <section className="dashboard-section dashboard-enrollment-section">
        <div className="dashboard-section-heading">
          <div>
            <span className="dashboard-section-kicker">MATRÍCULA</span>
            <h2>Alumnos por grado y sección</h2>
          </div>
          <span className="dashboard-total-label">{numberFormat.format(enrollmentRows.length)} grados · {numberFormat.format(sectionCount)} secciones</span>
        </div>
        {enrollmentRows.length > 0 ? (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Grado</th>
                  <th>Distribución por sección</th>
                  <th className="dashboard-table-number">Inscritos</th>
                </tr>
              </thead>
              <tbody>
                {enrollmentRows.map((grade) => (
                  <tr key={grade.id}>
                    <th scope="row" className="dashboard-grade-name">{grade.nombre}</th>
                    <td>
                      <div className="dashboard-section-list" aria-label={`Secciones de ${grade.nombre}`}>
                        {grade.sections.map((section, index) => (
                          <span className="dashboard-section-tag" key={`${grade.id}-${section.name}-${index}`}>
                            {section.name}<strong>{numberFormat.format(section.count)}</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="dashboard-table-number dashboard-enrollment-count">
                      {numberFormat.format(grade.total)}
                      <small>{grade.total === 1 ? 'alumno' : 'alumnos'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dashboard-empty-state">
            <span className="dashboard-empty-mark" aria-hidden="true">0</span>
            <div>
              <strong>Aún no hay matrícula registrada</strong>
              <p>Los alumnos aparecerán aquí cuando se completen las preinscripciones.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, detail, tone }) {
  return (
    <div className={`dashboard-stat dashboard-stat--${tone}`}>
      <span className="dashboard-stat-label">{label}</span>
      <strong className="dashboard-stat-value">{numberFormat.format(Number(value || 0))}</strong>
      <span className="dashboard-stat-detail">{detail}</span>
    </div>
  )
}

function RequestStatus({ label, count, total, percent, tone }) {
  return (
    <div className="request-status-row">
      <div className="request-status-copy">
        <span>{label}</span>
        <strong>{numberFormat.format(count)} <small>({percent}%)</small></strong>
      </div>
      <div
        className={`request-status-track request-status-track--${tone}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax={total}
        aria-valuenow={count}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
