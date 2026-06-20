import { X, Loader2 } from 'lucide-react'
import { VISIT_STATUS_INFO } from '../../utils/api'

export function VisitStatusBadge({ status }) {
  const info = VISIT_STATUS_INFO[status] || { label: status, color: 'text-gray-500', bg: 'bg-gray-100' }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${info.bg} ${info.color}`}>
      {info.label}
    </span>
  )
}

export function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', ...props }) {
  const base = 'inline-flex items-center gap-2 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary:   'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
    danger:    'bg-red-500 text-white hover:bg-red-600',
    ghost:     'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
    teal:      'bg-teal-600 text-white hover:bg-teal-700',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }
  return (
    <button {...props} disabled={loading || props.disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Card({ children, className = '', onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-3xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function Input({ label, hint, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      <input {...props}
        className={`w-full px-4 py-3 text-sm border rounded-xl bg-white text-slate-900 placeholder-slate-400
          border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent
          ${error ? 'border-red-400' : ''} ${className}`} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return <div className={`${s[size]} border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin`} />
}

export function Alert({ type = 'info', children }) {
  const styles = {
    info:    'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error:   'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
  }
  return <div className={`p-4 rounded-xl border text-sm ${styles[type]}`}>{children}</div>
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Playfair Display, serif' }}>{children}</h2>
      {action}
    </div>
  )
}

export function InfoRow({ label, value, mono }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-800 text-right max-w-[60%] ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</span>
    </div>
  )
}
