import React from 'react'

export default function AlumnosList({ alumnos, selectedIds = [], onToggle, onTogglePage }){
  if (!alumnos || alumnos.length === 0) {
    return <div className="management-empty-state">No hay alumnos para mostrar.</div>
  }

  return (
    <div className="management-table-scroll">
      <table className="styled-table">
        <thead>
          <tr><th>ID</th><th>Nombre</th><th>Apellidos</th><th>Representante</th></tr>
        </thead>
        <tbody>
          {alumnos.map(a=> (
            <tr
              key={a.id}
              className={selectedIds.includes(a.id) ? 'table-row-selected' : ''}
              aria-selected={selectedIds.includes(a.id)}
              tabIndex={0}
              onClick={() => onToggle(a.id)}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onToggle(a.id)
                }
              }}
            >
              <td>{a.id}</td>
              <td>{a.nombres}</td>
              <td>{a.apellidos}</td>
              <td>{a.representante}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
