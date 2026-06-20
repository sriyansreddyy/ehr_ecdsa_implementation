import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Heart, FileText, Calendar, ShieldCheck, User, LogOut, Fingerprint } from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { to: '/overview',    icon: Heart,        label: 'Health' },
  { to: '/visits',      icon: Calendar,     label: 'Visits' },
  { to: '/ehr',         icon: FileText,     label: 'My EHR' },
  { to: '/access',      icon: ShieldCheck,  label: 'Access' },
  { to: '/signatures',  icon: Fingerprint,  label: 'Signatures' },
  { to: '/profile',     icon: User,         label: 'Profile' },
]

export default function Layout({ children }) {
  const { patient, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (!patient) return null

  const isActive = (to) => location.pathname === to || location.pathname.startsWith(to + '/')

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center">
              <Heart size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900" style={{ fontFamily: 'Playfair Display, serif' }}>
                HealthChain
              </p>
              <p className="text-xs text-slate-400">Patient Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-700">{patient.patientId}</p>
              <p className="text-xs text-slate-400">{patient.email || 'No email'}</p>
            </div>
            <button onClick={handleLogout}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 z-40">
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex">
            {NAV.map(({ to, icon: Icon, label }) => {
              const active = isActive(to)
              return (
                <Link key={to} to={to}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                  <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-slate-100' : ''}`}>
                    <Icon size={18} strokeWidth={active ? 2.5 : 1.5} />
                  </div>
                  <span className={`text-[10px] font-medium ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
                </Link>
              )
            })}
          </div>
          {/* Safe area padding */}
          <div className="h-safe-area-inset-bottom" />
        </div>
      </nav>
    </div>
  )
}
