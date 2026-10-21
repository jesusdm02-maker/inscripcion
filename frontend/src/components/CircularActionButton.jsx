import React from 'react'

const icons = {
  create: <path d="M12 5v14M5 12h14" />,
  edit: <path d="m15 5 4 4M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z" />,
  delete: <path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" />,
  role: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20v-1a6 6 0 0 1 10.8-3.6M16 14l1.2 2 2.3.4v2.4l-2.3.4-1.2 2-2.1-.9-2.1.9-1.2-2-2.3-.4v-2.4l2.3-.4 1.2-2 2.1.9 2.1-.9Z" /></>,
  access: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="M9 12h6m-3-3v6" /></>,
  review: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  close: <path d="m18 6-12 12M6 6l12 12" />,
  apply: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  filter: <><path d="M4 5h16l-6.5 7.2v5.3l-3 1.5v-6.8L4 5Z" /><path d="M8 8h8" /></>,
  visibility: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="3" /></>,
  visibilityOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A11.3 11.3 0 0 1 12 5c6.4 0 10 7 10 7a15.6 15.6 0 0 1-3.2 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.6 7 10 7c1 0 1.9-.2 2.7-.5" /></>,
  login: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  page: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 13h8M8 17h8" /></>,
  approve: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  reject: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
  next: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  previous: <><path d="M19 12H5m6 6-6-6 6-6" /></>,
  submit: <><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" /></>,
  preinscription: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 13v6m-3-3h6" /></>,
  save: <path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8" />,
  exit: <><path d="m10 17 5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>
}

export default function CircularActionButton({ action, label, onClick, disabled = false, title, type = 'button', className = '', autoFocus = false, 'aria-pressed': ariaPressed, 'aria-current': ariaCurrent }) {
  return (
    <button
      type={type}
      className={`circular-action-button circular-action-button--${action}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title || label}
      autoFocus={autoFocus}
      aria-pressed={ariaPressed}
      aria-current={ariaCurrent}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={action === 'create' ? 2.5 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icons[action] || icons.save}
      </svg>
    </button>
  )
}
