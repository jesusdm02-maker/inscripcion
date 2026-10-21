import React, { useEffect, useState } from 'react'
import { fetchRepresentantes } from '../services/api'

export default function RepresentantesList(){
  const [representantes, setRepresentantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchRepresentantes()
      .then(data => setRepresentantes(data))
      .catch(err => {
        console.error(err)
        setError('No se pudieron cargar los representantes.')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="management-state">Cargando representantes...</div>
  if (error) return <div className="management-state management-state--error" role="alert">{error}</div>
  if (representantes.length === 0) return <div className="management-empty-state">Todavía no hay representantes registrados.</div>

  return (
    <div className="management-table-scroll">
      <table className="styled-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Apellido</th>
            <th>Cédula</th>
            <th>Parentesco</th>
            <th>Dirección</th>
            <th>Teléfono</th>
          </tr>
        </thead>
        <tbody>
          {representantes.map(r => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.nombre}</td>
              <td>{r.apellido}</td>
              <td>{r.cedula}</td>
              <td>{r.parentesco}</td>
              <td>{`${r.municipio || ''} ${r.calle || ''} ${r.avenida || ''}`.trim()}</td>
              <td>{r.numero_telefono}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
