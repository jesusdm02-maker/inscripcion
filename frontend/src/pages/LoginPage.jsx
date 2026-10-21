import React, { useState } from 'react'
import CircularActionButton from '../components/CircularActionButton'
import { useAuth } from '../context/AuthContext'
import schoolLogo from '../../../Logo/logo1.jpeg'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { login, error } = useAuth()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await login({ username, password })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <section className="login-visual" aria-label="Sistema de admisiones escolares">
        <div className="login-visual-photo" aria-hidden="true" />
        <div className="login-visual-content">
          <div className="login-brand">
            <img className="login-brand-mark" src={schoolLogo} alt="Logo del Colegio Batalla de Araure" />
            <span className="login-brand-copy">
              <strong>Comunidad escolar</strong>
              <h2>Batalla de Araure</h2>
            </span>
          </div>

          <div className="login-story">
            <span className="login-story-kicker">SISTEMA DE PREINSCRIPCIÓN</span>
            <h1>Un nuevo comienzo empieza aquí.</h1>
            <p>Un espacio claro para acompañar cada paso del ingreso escolar.</p>
          </div>

          <div className="login-visual-footer">
            <span className="login-live-mark" aria-hidden="true" />
            <span>Gestión escolar · Ciclo lectivo</span>
          </div>
        </div>
      </section>

      <section className="login-access" aria-labelledby="login-title">
        <div className="login-access-inner">
          <div className="login-mobile-brand">
            <img className="login-brand-mark" src={schoolLogo} alt="Logo del Colegio Batalla de Araure" />
            <span className="login-brand-copy">
              <strong>Comunidad escolar</strong>
              <h2>Batalla de Araure</h2>
            </span>
          </div>

          <div className="login-intro">
            <span className="login-access-kicker">ACCESO AL SISTEMA</span>
            <h2 id="login-title">Qué bueno verte.</h2>
            <p>Ingresa tus credenciales para continuar.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="login-email">
              Correo electrónico
              <input
                id="login-email"
                name="username"
                type="email"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="Ingresa tu correo electrónico"
                required
              />
            </label>

            <label htmlFor="login-password">
              Contraseña
              <span className="login-password-field">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  required
                />
                <CircularActionButton
                  className="login-password-toggle"
                  action={showPassword ? 'visibilityOff' : 'visibility'}
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                />
              </span>
            </label>

            {error && <p className="login-error" role="alert">{error}</p>}

            <button className="login-submit" type="submit" disabled={submitting}>
              <svg className="login-submit-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l5-5-5-5M15 12H3" />
                <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
              </svg>
              {submitting ? 'Verificando acceso...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="login-access-footer">
            <span><i aria-hidden="true" /> Acceso seguro</span>
            <span>¿Necesitas ayuda? Contacta a Secretaría</span>
          </div>
        </div>
      </section>
    </div>
  )
}
