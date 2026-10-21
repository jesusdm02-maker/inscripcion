import React from 'react'
import DashboardSummary from '../components/DashboardSummary'

export default function DashboardPage(){
  return (
    <div className="page-content dashboard-page">
      <div className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">GESTIÓN ESCOLAR</span>
          <h1>Panel de preinscripción</h1>
          <p>Resumen de solicitudes, alumnos y distribución de matrícula.</p>
        </div>
        <span className="dashboard-live-indicator"><span /> Datos del sistema</span>
      </div>
      <DashboardSummary />
    </div>
  )
}
