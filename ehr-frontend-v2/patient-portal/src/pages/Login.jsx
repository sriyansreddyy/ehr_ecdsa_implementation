import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Heart, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [mode, setMode]           = useState('login') // 'login' | 'register'
  const [patientId, setPatientId] = useState('')
  const [password, setPassword]   = useState('')
  const [newPass, setNewPass]     = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const { login, register }       = useAuth()
  const navigate                  = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await login(patientId.trim(), password)
      navigate('/overview')
    } catch (err) { setError(err.response?.data?.error || 'Invalid credentials') }
    finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    if (newPass.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return }
    try {
      await register(patientId.trim(), newPass, email, phone)
      navigate('/overview')
    } catch (err) { setError(err.response?.data?.error || 'Registration failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50 flex flex-col items-center justify-center px-5 py-10">

      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center mb-4 shadow-xl">
          <Heart size={28} className="text-white" fill="white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
          HealthChain
        </h1>
        <p className="text-slate-500 text-sm text-center max-w-xs">
          Your secure, blockchain-verified health records
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden">

        {/* Tab switcher */}
        <div className="flex border-b border-slate-100">
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError('') }}
              className={`flex-1 py-4 text-sm font-semibold transition-colors ${mode === m ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <div className="p-7">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Patient ID</label>
                <input type="text" value={patientId} onChange={e => setPatientId(e.target.value)}
                  required placeholder="e.g. PAT-001"
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder-slate-400" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    required placeholder="Your password"
                    className="w-full px-4 py-3 pr-12 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder-slate-400" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-slate-900 text-white font-bold rounded-xl py-3.5 text-sm hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="bg-teal-50 border border-teal-200 text-teal-700 text-xs rounded-xl px-4 py-3">
                Your Patient ID is provided by the hospital when you register in person.
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Patient ID *</label>
                <input type="text" value={patientId} onChange={e => setPatientId(e.target.value)}
                  required placeholder="e.g. PAT-001"
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Create Password *</label>
                <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                  required minLength={6} placeholder="Min. 6 characters"
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder-slate-400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210"
                  className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50 placeholder-slate-400" />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
              )}
              <button type="submit" disabled={loading}
                className="w-full bg-slate-900 text-white font-bold rounded-xl py-3.5 text-sm hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center mt-6 max-w-xs">
        All health records are secured on Hyperledger Fabric blockchain.<br />Your data is yours.
      </p>
    </div>
  )
}
