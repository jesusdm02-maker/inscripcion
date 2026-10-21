import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { createUserAccount, deleteUserAccount, fetchRoles, fetchRoleModuleAccess, fetchUsers, removeUserRole, saveRoleModuleAccess, searchStudentsForRepresentativeAccount, updateUserAccount } from '../services/api'
import CircularActionButton from '../components/CircularActionButton'
import { hasModuleAccess, hasPermission } from '../utils/permissions'

const emptyUserForm = {
  nombre: '',
  apellido: '',
  correo: '',
  password: '',
  role: '',
  representative_student_id: '',
  telefono: '',
  cedula: '',
  calle: '',
  avenida: '',
  municipio: ''
}

export default function UsuariosPage() {
  const { user } = useAuth()
  const canReadUsers = hasModuleAccess(user, 'Usuarios')
  const canReadRoles = hasModuleAccess(user, 'Roles')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedUserIds, setSelectedUserIds] = useState([])
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [accessModalOpen, setAccessModalOpen] = useState(false)
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [selectedRole, setSelectedRole] = useState('user')
  const [assigningRole, setAssigningRole] = useState(false)
  const [roleError, setRoleError] = useState('')
  const [creatingUser, setCreatingUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState(emptyUserForm)
  const [representativeStudentSearch, setRepresentativeStudentSearch] = useState('')
  const [representativeStudentResults, setRepresentativeStudentResults] = useState([])
  const [selectedRepresentativeStudent, setSelectedRepresentativeStudent] = useState(null)
  const [searchingRepresentativeStudents, setSearchingRepresentativeStudents] = useState(false)
  const [createUserError, setCreateUserError] = useState('')
  const [accessError, setAccessError] = useState('')
  const [accessState, setAccessState] = useState({ roles: [], modulos: [], permisos: [], access: [], permisosPorModulo: [] })
  const [accessRoleId, setAccessRoleId] = useState(null)
  const [loadingAccess, setLoadingAccess] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)
  const canCreate = hasPermission(user, 'Usuarios', 'Crear')
  const canUpdate = hasPermission(user, 'Usuarios', 'Actualizar')
  const canDelete = hasPermission(user, 'Usuarios', 'Eliminar')
  const canConfigureAccess = hasPermission(user, 'Modulos', 'Actualizar')
  const isCreatingRepresentative = editingUserId === null &&
    String(newUserForm.role || '').trim().toLowerCase() === 'representante'

  useEffect(() => {
    const query = representativeStudentSearch.trim()
    if (!createUserModalOpen || !isCreatingRepresentative || query.length < 2) {
      setRepresentativeStudentResults([])
      setSearchingRepresentativeStudents(false)
      return undefined
    }

    let cancelled = false
    const timeoutId = setTimeout(async () => {
      setSearchingRepresentativeStudents(true)
      try {
        const results = await searchStudentsForRepresentativeAccount(query, user?.role, user?.id)
        if (!cancelled) setRepresentativeStudentResults(results)
      } catch (err) {
        if (!cancelled) {
          setRepresentativeStudentResults([])
          setCreateUserError(err.response?.data?.error || 'No se pudieron buscar los alumnos.')
        }
      } finally {
        if (!cancelled) setSearchingRepresentativeStudents(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [createUserModalOpen, isCreatingRepresentative, representativeStudentSearch, user?.id, user?.role])

  useEffect(() => {
    if (!user) return
    if (canReadUsers) loadUsers()
    else {
      setUsers([])
      setSelectedUserIds([])
      setSelectedUserId(null)
      setLoading(false)
    }
    if (canReadRoles) loadRoles()
    else setRoles([])
  }, [user, canReadUsers, canReadRoles])

  const loadUsers = async (showLoading = true, clearError = true) => {
    try {
      if (showLoading) setLoading(true)
      const data = await fetchUsers(user?.role, user?.id)
      setUsers(data)
      setSelectedUserIds((current) => current.filter((id) => data.some((item) => item.id === id)))
      if (clearError) setError('')
    } catch (err) {
      setError('No se pudo cargar la lista de usuarios')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const loadRoles = async () => {
    try {
      const data = await fetchRoles(user?.role, user?.id)
      setRoles(data)
      if (data?.length) setSelectedRole(data[0].cargo || '')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los roles disponibles.')
    }
  }

  const handleCreateUserChange = (event) => {
    const { name, value } = event.target
    setNewUserForm(prev => ({ ...prev, [name]: value }))
  }

  const handleNewUserRoleChange = (event) => {
    const role = event.target.value
    setNewUserForm((previous) => ({
      ...previous,
      role,
      representative_student_id: '',
      ...(role.trim().toLowerCase() === 'representante'
        ? {}
        : { nombre: '', apellido: '', telefono: '', cedula: '', calle: '', avenida: '', municipio: '' })
    }))
    setRepresentativeStudentSearch('')
    setRepresentativeStudentResults([])
    setSelectedRepresentativeStudent(null)
    setCreateUserError('')
  }

  const selectRepresentativeStudent = (student) => {
    setSelectedRepresentativeStudent(student)
    setNewUserForm((previous) => ({
      ...previous,
      representative_student_id: String(student.id),
      nombre: student.representante_nombre || '',
      apellido: student.representante_apellido || '',
      cedula: student.representante_cedula || '',
      telefono: student.telefono || '',
      calle: student.calle || '',
      avenida: student.avenida || '',
      municipio: student.municipio || ''
    }))
    setRepresentativeStudentSearch('')
    setRepresentativeStudentResults([])
    setCreateUserError('')
  }

  const clearRepresentativeStudent = () => {
    setSelectedRepresentativeStudent(null)
    setNewUserForm((previous) => ({
      ...previous,
      representative_student_id: '',
      nombre: '',
      apellido: '',
      cedula: '',
      telefono: '',
      calle: '',
      avenida: '',
      municipio: ''
    }))
  }

  const handleCreateUserSubmit = async (event) => {
    event.preventDefault()
    if (editingUserId !== null ? !canUpdate : !canCreate) return
    if (isCreatingRepresentative && !newUserForm.representative_student_id) {
      setCreateUserError('Busca y selecciona el alumno que corresponde al representante.')
      return
    }
    setCreatingUser(true)
    setCreateUserError('')

    try {
      if (editingUserId !== null) {
        const updated = await updateUserAccount(editingUserId, newUserForm, user?.role, user?.id)
        setUsers(prev => prev.map(item => item.id === editingUserId
          ? { ...item, ...updated, rol: updated.rol || item.rol }
          : item))
      } else {
        const created = await createUserAccount(newUserForm, user?.role, user?.id)
        setUsers(prev => [...prev, {
          id: created.id,
          nombre: created.nombre,
          apellido: created.apellido,
          correo: created.correo,
          telefono: created.telefono || '',
          cedula: created.cedula || '',
          calle: created.calle || '',
          avenida: created.avenida || '',
          municipio: created.municipio || '',
          rol: created.rol || ''
        }])
      }
      setNewUserForm(emptyUserForm)
      setCreateUserModalOpen(false)
      setEditingUserId(null)
      setSelectedUserIds([])
      setSelectedUserId(null)
    } catch (err) {
      setCreateUserError(err.response?.data?.error || 'No se pudo crear el usuario')
    } finally {
      setCreatingUser(false)
    }
  }

  const handleSelectUser = (item) => {
    const next = selectedUserIds.includes(item.id)
      ? selectedUserIds.filter((id) => id !== item.id)
      : [...selectedUserIds, item.id]
    setSelectedUserIds(next)
    setSelectedUserId(next.length === 1 ? next[0] : null)
    if (next.length === 1) {
      const matchingRole = roles.find((role) => String(role.cargo).toLowerCase() === String(item.rol || '').toLowerCase())
      setSelectedRole(matchingRole?.cargo || item.rol || '')
    }
    setError('')
  }

  const openCreateUserModal = () => {
    if (!canCreate) return
    setEditingUserId(null)
    setNewUserForm(emptyUserForm)
    setRepresentativeStudentSearch('')
    setRepresentativeStudentResults([])
    setSelectedRepresentativeStudent(null)
    setCreateUserError('')
    setCreateUserModalOpen(true)
  }

  const openEditUserModal = (item) => {
    if (!canUpdate || !item) return
    setEditingUserId(item.id)
    setNewUserForm({
      ...emptyUserForm,
      nombre: item.nombre || '',
      apellido: item.apellido || '',
      correo: item.correo || '',
      role: item.rol || '',
      telefono: item.telefono || '',
      cedula: item.cedula || '',
      calle: item.calle || '',
      avenida: item.avenida || '',
      municipio: item.municipio || ''
    })
    setRepresentativeStudentSearch('')
    setRepresentativeStudentResults([])
    setSelectedRepresentativeStudent(null)
    setCreateUserError('')
    setCreateUserModalOpen(true)
  }

  const handleOpenRoleModal = (item) => {
    if (!canUpdate || !canReadRoles || !item) return
    setSelectedUserId(item.id)
    setSelectedRole('')
    setRoleError('')
    setRoleModalOpen(true)
    setError('')
  }

  const openAccessModal = async () => {
    if (!canConfigureAccess) return
    if (!selectedUser) return
    if (!selectedUser.rol) {
      setError('Asigna un rol al usuario antes de configurar sus permisos.')
      return
    }
    setLoadingAccess(true)
    setAccessError('')
    try {
      const data = await fetchRoleModuleAccess(user?.role, user?.id)
      const assignedRole = data.roles.find((role) =>
        String(role.cargo).trim().toLowerCase() === String(selectedUser.rol || '').trim().toLowerCase()
      )
      if (!assignedRole) {
        const message = 'No se encontró el rol asignado al usuario. Actualiza la lista de usuarios e inténtalo de nuevo.'
        setAccessError(message)
        setError(message)
        return
      }
      setAccessState(data)
      setAccessRoleId(assignedRole.id)
      setAccessModalOpen(true)
    } catch (err) {
      setAccessError(err.response?.data?.error || 'No se pudo cargar la configuración de acceso.')
      setError(err.response?.data?.error || 'No se pudo cargar la configuración de acceso.')
    } finally {
      setLoadingAccess(false)
    }
  }

  const toggleModuleAccess = (moduleId) => {
    setAccessState((previous) => {
      const currentModules = previous.access.find((item) => item.id_rol === accessRoleId)?.modulos || []
      const exists = currentModules.includes(moduleId)
      const access = previous.access.map((item) => item.id_rol === accessRoleId
        ? { ...item, modulos: exists ? item.modulos.filter((id) => id !== moduleId) : [...item.modulos, moduleId] }
        : item)
      if (!access.some((item) => item.id_rol === accessRoleId)) {
        access.push({ id_rol: accessRoleId, modulos: exists ? [] : [moduleId] })
      }

      const permisosPorModulo = previous.permisosPorModulo.filter((item) =>
        !(item.id_rol === accessRoleId && item.id_modulo === moduleId)
      )
      if (!exists) permisosPorModulo.push({ id_rol: accessRoleId, id_modulo: moduleId, permisos: [] })
      return { ...previous, access, permisosPorModulo }
    })
  }

  const toggleModulePermission = (moduleId, permissionId) => {
    setAccessState((previous) => {
      const currentModules = previous.access.find((item) => item.id_rol === accessRoleId)?.modulos || []
      if (!currentModules.includes(moduleId)) return previous

      const current = previous.permisosPorModulo.find((item) =>
        item.id_rol === accessRoleId && item.id_modulo === moduleId
      )?.permisos || []
      const permisos = current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId]
      const permisosPorModulo = previous.permisosPorModulo.filter((item) =>
        !(item.id_rol === accessRoleId && item.id_modulo === moduleId)
      )
      if (permisos.length) permisosPorModulo.push({ id_rol: accessRoleId, id_modulo: moduleId, permisos })
      return { ...previous, permisosPorModulo }
    })
  }

  const handleSaveAccess = async (event) => {
    event.preventDefault()
    if (!canConfigureAccess) return
    if (!accessRoleId) {
      setAccessError('Selecciona un rol para configurar sus accesos.')
      return
    }
    setSavingAccess(true)
    setAccessError('')
    try {
      const moduleIds = accessState.access.find((item) => item.id_rol === accessRoleId)?.modulos || []
      const modulePermissions = accessState.permisosPorModulo.filter((item) => item.id_rol === accessRoleId)
      await saveRoleModuleAccess({ roleId: accessRoleId, moduleIds, modulePermissions }, user?.role, user?.id)
      setAccessModalOpen(false)
    } catch (err) {
      setAccessError(err.response?.data?.error || 'No se pudieron guardar los accesos.')
    } finally {
      setSavingAccess(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!canDelete) return
    const targets = users.filter((item) => selectedUserIds.includes(item.id))
    if (!targets.length) return
    if (targets.some((item) => Number(item.id) === Number(user.id))) {
      setError('No puedes eliminar la cuenta con la que has iniciado sesión.')
      return
    }
    const names = targets.map((item) => `${item.nombre} ${item.apellido}`).join(', ')
    const confirmation = targets.length === 1
      ? `¿Eliminar al usuario "${names}"?`
      : `¿Eliminar los ${targets.length} usuarios seleccionados (${names})?`
    if (!window.confirm(confirmation)) return
    setError('')
    let deletedIds = []

    try {
      for (const item of targets) {
        await deleteUserAccount(item.id, user.role, user.id)
        deletedIds = [...deletedIds, item.id]
      }
      setSelectedUserIds([])
      setSelectedUserId(null)
    } catch (err) {
      setError(err.response?.data?.error || (deletedIds.length
        ? `Se eliminaron ${deletedIds.length} usuarios, pero no se pudieron eliminar todos.`
        : 'No se pudieron eliminar los usuarios seleccionados'))
    } finally {
      if (deletedIds.length) await loadUsers(false, false)
    }
  }

  const handleAssignRole = async (event) => {
    event.preventDefault()
    if (!canUpdate || !canReadRoles) return
    if (!selectedUserId || !selectedRole) {
      setRoleError('Selecciona un rol para asignárselo al usuario.')
      return
    }

    const selectedUser = users.find(item => item.id === selectedUserId)
    if (!selectedUser) {
      setRoleError('No se encontró el usuario seleccionado.')
      return
    }

    setAssigningRole(true)
    setRoleError('')

    try {
      const updated = await updateUserAccount(selectedUser.id, {
        nombre: selectedUser.nombre,
        apellido: selectedUser.apellido,
        correo: selectedUser.correo,
        password: '',
        role: selectedRole
      }, user.role, user.id)

      const assignedRole = roles.find((role) => String(role.cargo).toLowerCase() === selectedRole.toLowerCase())
      setUsers(prev => prev.map(item => item.id === selectedUser.id
        ? { ...item, id_rol: assignedRole?.id, rol: updated.rol || selectedRole.toLowerCase() }
        : item))
      setSelectedRole('')
      setRoleModalOpen(false)
    } catch (err) {
      setRoleError(err.response?.data?.error || 'No se pudo asignar el rol')
    } finally {
      setAssigningRole(false)
    }
  }

  const handleRemoveUserRole = async () => {
    if (!canUpdate || !canReadRoles || !selectedUserId) return
    setAssigningRole(true)
    setRoleError('')

    try {
      await removeUserRole(selectedUserId, user.role, user.id)
      setUsers(prev => prev.map(item => item.id === selectedUserId
        ? { ...item, id_rol: null, rol: null }
        : item))
      setSelectedRole('')
    } catch (err) {
      setRoleError(err.response?.data?.error || 'No se pudo quitar el rol del usuario.')
    } finally {
      setAssigningRole(false)
    }
  }

  const selectedUsers = users.filter((item) => selectedUserIds.includes(item.id))
  const selectedUser = selectedUsers.length === 1 ? selectedUsers[0] : null
  const roleTargetUser = users.find((item) => item.id === selectedUserId) || null
  const accessRole = accessState.roles.find((role) => Number(role.id) === Number(accessRoleId))
  const isAdministratorAccessRole = ['admin', 'administrador'].includes(
    String(accessRole?.cargo || '').trim().toLowerCase()
  )
  const availableRoles = roles.filter((role) => {
    if (!roleTargetUser) return false
    if (roleTargetUser.id_rol != null) return Number(role.id) !== Number(roleTargetUser.id_rol)
    return String(role.cargo).trim().toLowerCase() !== String(roleTargetUser.rol || '').trim().toLowerCase()
  })
  const selectedUserInitials = selectedUser
    ? `${selectedUser.nombre?.trim().charAt(0) || ''}${selectedUser.apellido?.trim().charAt(0) || ''}`.toUpperCase()
    : ''

  const handleUserRowKeyDown = (event, item) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectUser(item)
    }
  }

  return (
    <div className="page-content management-page management-page--usuarios">
      <div className="page-header">
        <div className="management-page-title">
          <span className="management-eyebrow">ADMINISTRACIÓN</span>
          <h2>Usuarios</h2>
          <p>Administra las cuentas y los roles asignados.</p>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}

      <div className="info-card management-selection-card">
        <div className="management-selection-row">
          <div className="management-selection-identity" aria-live="polite">
            <div className={`management-selection-avatar${selectedUser ? '' : ' is-empty'}`} aria-hidden="true">
              {selectedUser ? selectedUserInitials : '—'}
            </div>
            <div className="management-selected-user">
              <span className="management-eyebrow">USUARIO SELECCIONADO</span>
              <strong>{selectedUser ? `${selectedUser.nombre} ${selectedUser.apellido}` : 'Selecciona un usuario'}</strong>
              {selectedUser ? (
                <div className="management-selected-user-meta">
                  <span>{selectedUser.correo}</span>
                  <span className="management-role-badge">{selectedUser.rol || 'Sin rol asignado'}</span>
                </div>
              ) : (
                <span className="management-selection-hint">Elige una cuenta de la lista para administrar sus accesos.</span>
              )}
            </div>
          </div>
          <div className="management-selection-actions">
            <CircularActionButton action="access" label="Configurar acceso del usuario" title={!canConfigureAccess ? 'No tienes permiso para configurar accesos' : loadingAccess ? 'Cargando accesos' : !selectedUser?.rol ? 'Asigna un rol al usuario antes de configurar sus permisos' : 'Configurar acceso'} disabled={!canConfigureAccess || !selectedUser || !selectedUser.rol || loadingAccess} onClick={openAccessModal} />
            <CircularActionButton action="role" label="Cambiar rol del usuario" title={!canUpdate || !canReadRoles ? 'No tienes permiso para cambiar roles' : 'Cambiar rol'} disabled={!canUpdate || !canReadRoles || !selectedUser} onClick={() => selectedUser && handleOpenRoleModal(selectedUser)} />
          </div>
        </div>
      </div>

      <div className="table-card">
        <div className="management-table-heading">
          <div>
            <h3>Directorio de usuarios</h3>
            <p>Selecciona una o varias filas; editar y asignar rol requieren una sola.</p>
          </div>
          <span className="management-count">{users.length.toLocaleString('es')} {users.length === 1 ? 'usuario' : 'usuarios'}</span>
          <div className="circular-actions" aria-label="Acciones de usuarios">
            <CircularActionButton action="create" label="Crear usuario" title={!canCreate ? 'No tienes permiso para crear usuarios' : undefined} disabled={!canCreate} onClick={openCreateUserModal} />
            <CircularActionButton action="edit" label="Editar usuario seleccionado" title={!canUpdate ? 'No tienes permiso para editar usuarios' : selectedUserIds.length > 1 ? 'Solo puedes editar un usuario a la vez' : 'Editar usuario seleccionado'} disabled={!canUpdate || !selectedUser} onClick={() => selectedUser && openEditUserModal(selectedUser)} />
            <CircularActionButton action="delete" label={selectedUserIds.length === 1 ? 'Eliminar usuario seleccionado' : `Eliminar ${selectedUserIds.length} usuarios seleccionados`} title={!canDelete ? 'No tienes permiso para eliminar usuarios' : undefined} disabled={!canDelete || !selectedUserIds.length} onClick={handleDeleteSelected} />
          </div>
        </div>
        {!canReadUsers ? <div className="management-empty-state">La lectura de usuarios está deshabilitada.</div> : loading ? <p className="management-state">Cargando usuarios...</p> : users.length === 0 ? <div className="management-empty-state">No hay usuarios registrados.</div> : (
          <div className="management-table-scroll">
          <table className="styled-table">
            <thead>
              <tr><th>Usuario</th><th>Rol</th><th>Correo electrónico</th></tr>
            </thead>
            <tbody>
              {users.map(item => (
                <tr
                  key={item.id}
                  className={selectedUserIds.includes(item.id) ? 'table-row-selected' : ''}
                  aria-selected={selectedUserIds.includes(item.id)}
                  tabIndex={0}
                  onClick={() => handleSelectUser(item)}
                  onKeyDown={(event) => handleUserRowKeyDown(event, item)}
                >
                  <td>
                    <span className="management-primary-cell management-user-full-name">
                      <span>{item.nombre}</span>
                      <span>{item.apellido}</span>
                    </span>
                    <span className="management-secondary-cell">ID #{item.id}</span>
                  </td>
                  <td><span className="management-role-badge">{item.rol || 'Sin rol asignado'}</span></td>
                  <td>{item.correo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {createUserModalOpen && (editingUserId === null ? canCreate : canUpdate) && (
        <div className="modal-overlay user-account-modal-overlay" role="dialog" aria-modal="true" aria-label={editingUserId !== null ? 'Editar usuario' : 'Crear usuario'}>
          <div className={`modal-card management-form-modal user-account-form-modal${editingUserId !== null ? ' management-edit-modal' : ''}`}>
            <div className="user-account-form-heading">
              <div>
                <span className="management-eyebrow">GESTIÓN DE CUENTAS</span>
                <h3>{editingUserId !== null ? 'Editar usuario' : 'Crear usuario'}</h3>
                <p>Completa los datos para {editingUserId !== null ? 'actualizar la cuenta' : 'registrar una nueva cuenta'}.</p>
              </div>
            </div>
            <form onSubmit={handleCreateUserSubmit} className="form-grid user-account-form">
              <section className="user-form-section user-form-section--personal" aria-labelledby="user-personal-heading">
                <div className="user-form-section-heading">
                  <span className="user-form-section-icon" aria-hidden="true">01</span>
                  <div>
                    <h4 id="user-personal-heading" className="user-form-section-title">Datos personales</h4>
                    <p>Información básica del usuario.</p>
                  </div>
                </div>
                <div className="form-row">
                  <label>
                    Nombre
                    <input name="nombre" value={newUserForm.nombre} onChange={handleCreateUserChange} maxLength={50} placeholder="Nombre" autoComplete="given-name" required readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent)} />
                  </label>
                  <label>
                    Apellido
                    <input name="apellido" value={newUserForm.apellido} onChange={handleCreateUserChange} maxLength={50} placeholder="Apellido" autoComplete="family-name" required readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent)} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Cédula
                    <input name="cedula" value={newUserForm.cedula} onChange={handleCreateUserChange} maxLength={50} placeholder="Cédula" autoComplete="off" required readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent)} />
                  </label>
                  <label>
                    Teléfono
                    <input type="tel" name="telefono" value={newUserForm.telefono} onChange={handleCreateUserChange} maxLength={50} autoComplete="tel" placeholder="Teléfono" required readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent?.telefono)} />
                  </label>
                </div>
              </section>

              <section className="user-form-section user-form-section--access" aria-labelledby="user-access-heading">
                <div className="user-form-section-heading">
                  <span className="user-form-section-icon" aria-hidden="true">02</span>
                  <div>
                    <h4 id="user-access-heading" className="user-form-section-title">Acceso a la cuenta</h4>
                    <p>Datos para iniciar sesión en el sistema.</p>
                  </div>
                </div>
                <div className="form-row">
                  {editingUserId === null && (
                    <label>
                      Rol
                      <select name="role" value={newUserForm.role} onChange={handleNewUserRoleChange} disabled={creatingUser}>
                        <option value="">Crear sin rol asignado</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.cargo}>{role.cargo}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Correo electrónico
                    <input type="email" name="correo" value={newUserForm.correo} onChange={handleCreateUserChange} maxLength={50} placeholder="Correo electrónico" autoComplete="email" required />
                  </label>
                  <label>
                    Contraseña{editingUserId !== null && <span className="user-form-optional">Opcional</span>}
                    <input type="password" name="password" value={newUserForm.password} onChange={handleCreateUserChange} minLength={4} maxLength={255} required={editingUserId === null} placeholder="Contraseña" autoComplete="new-password" />
                    {editingUserId !== null && <small className="user-form-help">Déjala vacía para conservar la actual.</small>}
                  </label>
                </div>
                {isCreatingRepresentative && (
                  <div className="representative-student-picker">
                    <label htmlFor="representative-student-search">Alumno asociado</label>
                    {selectedRepresentativeStudent ? (
                      <div className="representative-student-selection">
                        <div>
                          <strong>{selectedRepresentativeStudent.nombres} {selectedRepresentativeStudent.apellidos}</strong>
                          <span>Representante: {selectedRepresentativeStudent.representante_nombre} {selectedRepresentativeStudent.representante_apellido}</span>
                        </div>
                        <button type="button" onClick={clearRepresentativeStudent} disabled={creatingUser}>Cambiar alumno</button>
                      </div>
                    ) : (
                      <>
                        <input
                          id="representative-student-search"
                          type="search"
                          value={representativeStudentSearch}
                          onChange={(event) => {
                            setRepresentativeStudentSearch(event.target.value)
                            setCreateUserError('')
                          }}
                          placeholder="Buscar por nombre, apellido o ID del alumno"
                          autoComplete="off"
                          disabled={creatingUser}
                        />
                        <small className="user-form-help">Escribe al menos dos caracteres y selecciona al alumno correspondiente.</small>
                        {searchingRepresentativeStudents && <span className="representative-student-state">Buscando alumnos...</span>}
                        {!searchingRepresentativeStudents && representativeStudentSearch.trim().length >= 2 && representativeStudentResults.length === 0 && (
                          <span className="representative-student-state">No se encontraron alumnos.</span>
                        )}
                        {representativeStudentResults.length > 0 && (
                          <div className="representative-student-results" role="listbox" aria-label="Resultados de alumnos">
                            {representativeStudentResults.map((student) => (
                              <button
                                key={student.id}
                                type="button"
                                role="option"
                                aria-selected="false"
                                onClick={() => selectRepresentativeStudent(student)}
                              >
                                <strong>{student.nombres} {student.apellidos}</strong>
                                <span>Representante: {student.representante_nombre} {student.representante_apellido}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>

              <section className="user-form-section user-form-section--address" aria-labelledby="user-address-heading">
                <div className="user-form-section-heading">
                  <span className="user-form-section-icon" aria-hidden="true">03</span>
                  <div>
                    <h4 id="user-address-heading" className="user-form-section-title">Dirección</h4>
                    <p className="user-form-optional">Opcional</p>
                  </div>
                </div>
                <div className="form-row user-form-address-fields">
                  <label>
                    Municipio
                    <input name="municipio" value={newUserForm.municipio} onChange={handleCreateUserChange} maxLength={100} placeholder="Municipio" autoComplete="address-level2" readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent)} />
                  </label>
                  <label>
                    Calle
                    <input name="calle" value={newUserForm.calle} onChange={handleCreateUserChange} maxLength={50} placeholder="Calle" autoComplete="address-line1" readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent)} />
                  </label>
                  <label>
                    Avenida
                    <input name="avenida" value={newUserForm.avenida} onChange={handleCreateUserChange} maxLength={50} placeholder="Avenida" readOnly={isCreatingRepresentative && Boolean(selectedRepresentativeStudent)} />
                  </label>
                </div>
              </section>

              {createUserError && <p className="form-error">{createUserError}</p>}

              <div className="form-actions user-account-form-actions">
                <CircularActionButton
                  action={editingUserId !== null ? 'save' : 'create'}
                  type="submit"
                  label={creatingUser ? 'Guardando usuario' : editingUserId !== null ? 'Guardar cambios del usuario' : 'Crear usuario'}
                  title={creatingUser ? 'Guardando usuario' : editingUserId !== null ? 'Guardar cambios del usuario' : 'Crear usuario'}
                  disabled={creatingUser || (editingUserId !== null ? !canUpdate : !canCreate)}
                />
                <CircularActionButton
                  action="exit"
                  label="Salir sin guardar"
                  title="Salir sin guardar"
                  onClick={() => { setCreateUserModalOpen(false); setEditingUserId(null) }}
                  disabled={creatingUser}
                />
              </div>
            </form>
          </div>
        </div>
      )}

      {canUpdate && roleModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Asignar rol">
          <div className="modal-card management-form-modal role-assignment-modal">
            <div className="role-assignment-heading">
              <span className="management-eyebrow">GESTIÓN DE ACCESOS</span>
              <h3>Roles del usuario</h3>
              <p>Revisa el rol actual o asígnale uno diferente.</p>
            </div>
            <div className="role-assignment-layout">
              <div className="role-assignment-profile">
                <div className="role-assignment-user">
                  <span className="role-assignment-avatar" aria-hidden="true">
                    {`${roleTargetUser?.nombre?.trim().charAt(0) || ''}${roleTargetUser?.apellido?.trim().charAt(0) || ''}`.toUpperCase() || 'U'}
                  </span>
                  <span className="role-assignment-user-copy">
                    <strong>{roleTargetUser ? `${roleTargetUser.nombre} ${roleTargetUser.apellido}` : 'Usuario no disponible'}</strong>
                    <small>{roleTargetUser?.correo}</small>
                  </span>
                </div>
                <div className="role-assignment-current">
                  <div>
                    <span className="role-assignment-label">ROL ACTUAL</span>
                    <strong>{roleTargetUser?.rol || 'Sin rol asignado'}</strong>
                  </div>
                  {roleTargetUser?.rol && (
                    <CircularActionButton
                      action="delete"
                      className="role-remove-button"
                      label={`Quitar el rol ${roleTargetUser.rol}`}
                      title={Number(roleTargetUser.id) === Number(user.id) ? 'No puedes quitarte tu propio rol desde esta sesión' : 'Quitar rol actual'}
                      onClick={handleRemoveUserRole}
                      disabled={assigningRole || Number(roleTargetUser.id) === Number(user.id)}
                    />
                  )}
                </div>
              </div>
              <form onSubmit={handleAssignRole} className="form-grid role-assignment-form">
                <label htmlFor="user-role-select">Asignar otro rol
                  <select id="user-role-select" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} disabled={assigningRole || availableRoles.length === 0}>
                    <option value="">{availableRoles.length ? 'Selecciona un rol' : 'No hay otros roles disponibles'}</option>
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.cargo}>{role.cargo}</option>
                    ))}
                  </select>
                </label>
                {roleError && <p className="form-error" role="alert">{roleError}</p>}
                <div className="form-actions">
                  <CircularActionButton action="exit" label="Cerrar roles" title="Cerrar" onClick={() => setRoleModalOpen(false)} disabled={assigningRole} />
                  <CircularActionButton action="role" type="submit" label={assigningRole ? 'Asignando rol' : 'Asignar rol'} title={assigningRole ? 'Asignando rol' : 'Asignar rol'} disabled={assigningRole || !selectedRole} />
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {canConfigureAccess && accessModalOpen && (
        <div className="modal-overlay access-modal-overlay" role="dialog" aria-modal="true" aria-label="Configurar módulos y permisos">
          <div className="modal-card access-modal-card">
            <header className="access-modal-header">
              <div>
                <span className="management-eyebrow">CONTROL DE ACCESO</span>
                <h3>Módulos y permisos</h3>
                <p>Configura los módulos y las acciones permitidas para cada rol.</p>
              </div>
              <label className="access-role-select">Rol
                <select value={accessRoleId || ''} onChange={(event) => setAccessRoleId(Number(event.target.value))}>
                  {accessState.roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.cargo}</option>
                  ))}
                </select>
              </label>
            </header>
            <form onSubmit={handleSaveAccess} className="access-modal-form">
              {isAdministratorAccessRole && (
                <p className="admin-access-notice">El rol administrador tiene acceso completo a todos los módulos y permisos.</p>
              )}
              <div className="module-access-list">
                {accessState.modulos.map((modulo) => {
                  const currentRoleAccess = accessState.access.find((item) => item.id_rol === accessRoleId)?.modulos || []
                  const checked = currentRoleAccess.includes(modulo.id_modulo)
                  const currentPermissions = accessState.permisosPorModulo.find((item) =>
                    item.id_rol === accessRoleId && item.id_modulo === modulo.id_modulo
                  )?.permisos || []
                  return (
                    <section key={modulo.id_modulo} className={`module-access-card${checked ? ' is-enabled' : ''}`}>
                      <label className="module-access-item module-access-title">
                        <input
                          type="checkbox"
                          checked={isAdministratorAccessRole || checked}
                          onChange={() => {
                            if (!isAdministratorAccessRole) toggleModuleAccess(modulo.id_modulo)
                          }}
                        />
                        <span>{modulo.nombre_modulo}</span>
                      </label>
                      <div className="permission-list">
                        {accessState.permisos.map((permiso) => {
                          const permissionChecked = currentPermissions.includes(permiso.id_permisos)
                          const label = ['leer', 'mirada lasciva'].includes(String(permiso.accion).toLowerCase())
                            ? 'Leer'
                            : permiso.accion
                          return (
                            <label key={permiso.id_permisos} className="module-access-item">
                              <input
                                type="checkbox"
                                checked={isAdministratorAccessRole || permissionChecked}
                                disabled={!checked && !isAdministratorAccessRole}
                                onChange={() => {
                                  if (!isAdministratorAccessRole) toggleModulePermission(modulo.id_modulo, permiso.id_permisos)
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
              {accessError && <p className="form-error access-modal-error">{accessError}</p>}
              <div className="form-actions access-modal-actions">
                <CircularActionButton
                  action="save"
                  type="submit"
                  label={savingAccess ? 'Guardando accesos' : 'Guardar accesos'}
                  title={savingAccess ? 'Guardando accesos' : 'Guardar accesos'}
                  disabled={savingAccess || !accessRoleId || !canConfigureAccess}
                />
                <CircularActionButton
                  action="exit"
                  label="Salir sin guardar"
                  title="Salir sin guardar"
                  disabled={savingAccess}
                  onClick={() => setAccessModalOpen(false)}
                />
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
