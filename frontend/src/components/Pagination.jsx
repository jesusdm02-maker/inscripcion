import React from 'react'
import CircularActionButton from './CircularActionButton'

export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  const pages = []
  const start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)

  for (let i = start; i <= end; i += 1) {
    pages.push(i)
  }

  return (
    <div className="pagination" aria-label="Paginación">
      <CircularActionButton action="previous" className="pagination-button" label="Página anterior" title="Página anterior" onClick={() => onPageChange(page - 1)} disabled={page === 1} />
      {pages.map(num => (
        <CircularActionButton
          key={num}
          action="page"
          className={`pagination-button${num === page ? ' active' : ''}`}
          label={`Ir a la página ${num}`}
          title={`Página ${num}`}
          aria-current={num === page ? 'page' : undefined}
          onClick={() => onPageChange(num)}
        />
      ))}
      <CircularActionButton action="next" className="pagination-button" label="Página siguiente" title="Página siguiente" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} />
    </div>
  )
}
