import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  Users, Calendar, FlaskConical, FileText,
  LogOut, Activity, Stethoscope, Pill, FolderOpen,
  ChevronRight, Menu, X, ShieldCheck
} from 'lucide-react'
import { useState } from 'react'

const ROLE_CONFIG = {
  receptionist: {
    label: 'Reception',
    color: 'bg-slate-900',
    accent: 'text-slate-200',
    nav: [
      { to: '/patients',       icon: Users,     label: 'Patients' },
      { to: '/visits',         icon: Calendar,  label: 'Visits' },
      { to: '/register',       icon: Users,     label: 'Register Patient' },
      { to: '/open-visit',     icon: Calendar,  label: 'Open Visit' },
    ],
  },
  admin: {
    label: 'Administration',
    color: 'bg-slate-900',
    accent: 'text-slate-200',
    nav: [
      { to: '/patients',       icon: Users,     label: 'Patients' },
      { to: '/staff',          icon: Users,     label: 'Clinical Staff' },
      { to: '/visits',         icon: Calendar,  label: 'Visits' },
      { to: '/register',       icon: Users,     label: 'Register Patient' },
      { to: '/open-visit',     icon: Calendar,  label: 'Open Visit' },
      { to: '/discharge',      icon: LogOut,    label: 'Discharge' },
    ],
  },
  doctor: {
    label: 'Doctor',
    color: 'bg-blue-950',
    accent: 'text-blue-200',
    nav: [
      { to: '/my-visits',      icon: Stethoscope, label: 'My Visits' },
      { to: '/visit-detail',   icon: FileText,    label: 'Visit Detail' },
    ],
  },
  nurse: {
    label: 'Nurse',
    color: 'bg-violet-950',
    accent: 'text-violet-200',
    nav: [
      { to: '/my-visits',      icon: Activity,  label: 'My Visits' },
    ],
  },
  pharmacist: {
    label: 'Pharmacy',
    color: 'bg-teal-950',
    accent: 'text-teal-200',
    nav: [
      { to: '/dispense',       icon: Pill,      label: 'Dispense' },
    ],
  },
  medrecordofficer: {
    label: 'Medical Records',
    color: 'bg-emerald-950',
    accent: 'text-emerald-200',
    nav: [
      { to: '/finalize',       icon: FolderOpen, label: 'Finalize Records' },
    ],
  },
}

export default function Layout({ children }) {
  const { user, logout, userKey } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  if (!user) return null

  const cfg = ROLE_CONFIG[user.role] || ROLE_CONFIG.receptionist
  const isActive = (to) => location.pathname === to || location.pathname.startsWith(to + '/')

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleCopyKey = async () => {
    if (!userKey) return
    try {
      await navigator.clipboard.writeText(userKey)
      setCopyStatus('Key copied')
      setTimeout(() => setCopyStatus(''), 2000)
    } catch {
      setCopyStatus('Copy failed')
      setTimeout(() => setCopyStatus(''), 2000)
    }
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
            <ShieldCheck size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm font-display">EHR Chain</p>
            <p className={`text-xs ${cfg.accent}`}>{cfg.label}</p>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/10">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">{user.username?.[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.username}</p>
            <p className={`text-xs ${cfg.accent} capitalize`}>{user.role}</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-white/10 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/80 font-medium">Access Key</p>
            <button
              type="button"
              onClick={handleCopyKey}
              className="text-xs text-white/70 hover:text-white transition-colors"
              disabled={!userKey}
            >
              Copy
            </button>
          </div>
          <p className="text-[11px] text-white/60 mt-1">
            Status: {userKey ? 'Generated' : 'Not available'}
          </p>
          {copyStatus && (
            <p className="text-[11px] text-emerald-200 mt-1">{copyStatus}</p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {cfg.nav.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              isActive(to)
                ? 'bg-white/20 text-white font-medium'
                : `text-white/60 hover:text-white hover:bg-white/10`
            }`}
          >
            <Icon size={16} />
            {label}
            {isActive(to) && <ChevronRight size={14} className="ml-auto" />}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all w-full"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex w-56 flex-shrink-0 ${cfg.color} flex-col`}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className={`absolute left-0 top-0 h-full w-64 ${cfg.color} flex flex-col`}>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)}>
            <Menu size={20} className="text-slate-700" />
          </button>
          <span className="font-semibold text-slate-900 font-display">EHR Chain</span>
          <div className="w-5" />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
