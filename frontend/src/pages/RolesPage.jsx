import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { createRole, deleteRole, fetchRoles, updateRole } from '../services/api'
import CircularActionButton from '../components/CircularActionButton'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

const emptyForm = { cargo: '' }

export default function RolesPage() {
  const { user } = useAuth()
  const canRead = hasModuleAccess(user, 'Roles')
  const canCreate = hasPermission(user, 'Roles', 'Crear')
  const canUpdate = hasPermission(user, 'Roles', 'Actualizar')
  const canDelete = hasPermission(user, 'Roles', 'Eliminar')
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])

  const loadRoles = async (showLoading = true, clearError = true) => {
    try {
      if (showLoading) setLoading(true)
      const data = await fetchRoles(user?.role, user?.id)
      setRoles(data)
      setSelectedIds((current) => current.filter((id) => data.some((role) => role.id === id)))
      if (clearError) setError('')
    } catch (err) {
      setError('No se pudieron cargar los roles')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => {
    if (user && canRead) {
      loadRoles()
    } else {
      setRoles([])
      setSelectedIds([])
      setLoading(false)
    }
  }, [user, canRead])

  const openNewRoleModal = () => {
    if (!canCreate) return
    setSelectedIds([])
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setModalOpen(true)
  }

  const openEditRoleModal = (role) => {
    if (!canUpdate || !role) return
    setEditingId(role.id)
    setForm({ cargo: role.cargo || '' })
    setError('')
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  const handleChange = (event) => {
    setForm(prev => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (editingId ? !canUpdate : !canCreate) return
    setSaving(true)
    setError('')

    try {
      if (editingId) {
        const updated = await updateRole(editingId, form, user.role, user.id)
        setRoles(prev => prev.map(item => item.id === editingId ? updated : item))
        setSelectedIds([])
      } else {
        const created = await createRole(form, user.role, user.id)
        setRoles(prev => [created, ...prev])
      }
      closeModal()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el rol')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!canDelete) return
    const targets = roles.filter((role) => selectedIds.includes(role.id))
    if (!targets.length) return
    const names = targets.map((role) => role.cargo).join(', ')
    const confirmation = targets.length === 1
      ? `¿Eliminar el rol "${names}"?`
      : `¿Eliminar los ${targets.length} roles seleccionados (${names})?`
    if (!window.confirm(confirmation)) return
    setError('')
    let deletedCount = 0

    try {
      for (const role of targets) {
        await deleteRole(role.id, user.role, user.id)
        deletedCount += 1
      }
      setSelectedIds([])
    } catch (err) {
      setError(err.response?.data?.error || (deletedCount
        ? `Se eliminaron ${deletedCount} roles, pero no se pudieron eliminar todos.`
        : 'No se pudieron eliminar los roles seleccionados'))
    } finally {
      await loadRoles(false, false)
    }
  }

  const selectedRoles = roles.filter((role) => selectedIds.includes(role.id))
  const selectedRole = selectedRoles.length === 1 ? selectedRoles[0] : null
  const toggleRoleSelection = (role) => {
    setSelectedIds((current) => current.includes(role.id)
      ? current.filter((id) => id !== role.id)
      : [...current, role.id])
  }

  const handleRoleRowKeyDown = (event, role) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleRoleSelection(role)
    }
  }

  return (
    <div className="page-content management-page management-page--roles">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">ADMINISTRACIÓN</span>
          <h2>Roles y permisos</h2>
          <p>Define los perfiles que determinan el acceso al sistema.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-card">
        <div className="table-card-header">
          <div>
            <h3>Perfiles disponibles</h3>
            <p className="management-card-subtitle">Administra nombres de roles existentes.</p>
          </div>
          <div className="management-header-actions">
            <span className="management-count">{roles.length.toLocaleString('es')} {roles.length === 1 ? 'rol' : 'roles'}</span>
            <div className="circular-actions" aria-label="Acciones de roles">
              <CircularActionButton action="create" label="Crear rol" title={!canCreate ? 'No tienes permiso para crear roles' : undefined} disabled={!canCreate} onClick={openNewRoleModal} />
              <CircularActionButton action="edit" label="Editar rol seleccionado" title={!canUpdate ? 'No tienes permiso para editar roles' : selectedIds.length > 1 ? 'Solo puedes editar un rol a la vez' : 'Editar rol seleccionado'} disabled={!canUpdate || !selectedRole} onClick={() => selectedRole && openEditRoleModal(selectedRole)} />
              <CircularActionButton action="delete" label={selectedIds.length === 1 ? 'Eliminar rol seleccionado' : `Eliminar ${selectedIds.length} roles seleccionados`} title={!canDelete ? 'No tienes permiso para eliminar roles' : undefined} disabled={!canDelete || !selectedIds.length} onClick={handleDeleteSelected} />
            </div>
          </div>
        </div>
        {!canRead ? <div className="management-empty-state">La lectura de roles está deshabilitada.</div> : loading ? <p className="management-state">Cargando roles...</p> : roles.length === 0 ? <div className="management-empty-state">Todavía no hay roles registrados.</div> : (
          <div className="management-table-scroll">
          <table className="styled-table">
            <thead>
              <tr><th>Rol</th><th>Identificador</th></tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr
                  key={role.id}
                  className={selectedIds.includes(role.id) ? 'table-row-selected' : ''}
                  aria-selected={selectedIds.includes(role.id)}
                  tabIndex={0}
                  onClick={() => toggleRoleSelection(role)}
                  onKeyDown={(event) => handleRoleRowKeyDown(event, role)}
                >
                  <td><span className="management-primary-cell">{role.cargo}</span></td>
                  <td><span className="management-secondary-cell">#{role.id}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {modalOpen && (editingId === null ? canCreate : canUpdate) && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) closeModal()
        }}>
          <section className="modal-card management-form-modal management-edit-modal management-config-form-modal" role="dialog" aria-modal="true" aria-labelledby="role-form-title">
            <header className="management-form-modal-header">
              <span className="management-eyebrow">GESTIÓN DE ACCESOS</span>
              <h3 id="role-form-title">{editingId ? 'Editar rol' : 'Nuevo rol'}</h3>
              <p>{editingId ? 'Actualiza el nombre del rol asignado a los usuarios.' : 'Crea un rol para organizar los accesos de usuarios.'}</p>
            </header>
            <form onSubmit={handleSave} className="form-grid management-config-form">
              <section className="management-edit-section">
                <div className="management-edit-section-heading">
                  <h4>Identificación del rol</h4>
                  <p>Usa un nombre breve y fácil de reconocer.</p>
                </div>
                <label>Nombre del rol
                  <input name="cargo" value={form.cargo} onChange={handleChange} placeholder="Escribe el nombre del rol" required />
                </label>
              </section>
              <div className="form-actions">
                <CircularActionButton action="exit" label="Salir sin guardar" title="Salir sin guardar" onClick={closeModal} disabled={saving} />
                <CircularActionButton action={editingId ? 'save' : 'create'} type="submit" label={saving ? 'Guardando rol' : editingId ? 'Guardar cambios del rol' : 'Crear rol'} title={saving ? 'Guardando rol' : editingId ? 'Guardar cambios del rol' : 'Crear rol'} disabled={saving || (editingId ? !canUpdate : !canCreate)} />
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
