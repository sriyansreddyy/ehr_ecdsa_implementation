import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldCheck, Eye, EyeOff, ChevronDown, Copy, KeyRound, CheckCircle } from 'lucide-react'
import { ensureUserKey, getUserKey, matchesKey } from '../utils/keyAuth'

const ROLES = [
  { value: 'receptionist',     label: 'Receptionist',       hint: 'recept123' },
  { value: 'admin',            label: 'Hospital Admin',      hint: 'hadminpw' },
  { value: 'doctor',           label: 'Doctor',              hint: 'docpw' },
  { value: 'nurse',            label: 'Nurse',               hint: 'nursepw' },
  { value: 'pharmacist',       label: 'Pharmacist',          hint: 'pharmpw' },
  { value: 'medrecordofficer', label: 'Medical Records',     hint: 'medpw' },
]

const ROLE_USERNAMES = {
  receptionist:     'receptionist',
  admin:            'hospitaladmin',
  doctor:           'doctor',
  nurse:            'nurse',
  pharmacist:       'pharmacist',
  medrecordofficer: 'medrecordofficer',
}

export default function LoginPage() {
  const [role, setRole]           = useState('receptionist')
  const [username, setUsername]   = useState('receptionist')
  const [password, setPassword]   = useState('recept123')
  const [accessKey, setAccessKey] = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [keyStatus, setKeyStatus] = useState('')
  const [copied, setCopied]       = useState(false)
  const [pasted, setPasted]       = useState(false)
  const { login }                 = useAuth()
  const navigate                  = useNavigate()

  const handleRoleChange = (r) => {
    setRole(r)
    setUsername(ROLE_USERNAMES[r])
    setPassword(ROLES.find(x => x.value === r)?.hint || '')
    setAccessKey('')
    setKeyStatus('')
    setCopied(false)
    setPasted(false)
    setError('')
  }

  const handleCopyKey = async () => {
    if (!username) return
    try {
      const key = ensureUserKey(username)
      await navigator.clipboard.writeText(key)
      setCopied(true)
      setKeyStatus('Access key copied')
    } catch {
      setKeyStatus('Copy failed. Try again.')
    }
  }

  const handlePaste = (e) => {
    const pastedValue = e.clipboardData.getData('text') || ''
    setAccessKey(pastedValue)
    setPasted(true)
    setKeyStatus('Access key pasted')
    e.preventDefault()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const storedKey = getUserKey(username)
      if (!storedKey) {
        throw new Error('Access key not found. Copy your key first.')
      }
      if (!matchesKey(accessKey, storedKey)) {
        throw new Error('Access key does not match')
      }
      const userData = await login(username, password)
      // Route based on role
      const routes = {
        receptionist:     '/patients',
        admin:            '/patients',
        doctor:           '/my-visits',
        nurse:            '/my-visits',
        pharmacist:       '/dispense',
        medrecordofficer: '/finalize',
      }
      navigate(routes[userData.role] || '/patients')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-slate-950" />

      {/* Decorative grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4 backdrop-blur-sm border border-white/10">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-white mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Hospital Portal
          </h1>
          <p className="text-slate-400 text-sm">EHR Blockchain — Clinical Staff Access</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">Role</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={e => handleRoleChange(e.target.value)}
                  className="w-full appearance-none bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 cursor-pointer"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value} className="bg-slate-900">{r.label}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500"
                placeholder="username"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500"
                  placeholder="password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Access Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Access Key</label>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-200 hover:text-white transition-colors"
                >
                  <Copy size={12} /> Copy key
                </button>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={accessKey}
                  onChange={e => setAccessKey(e.target.value)}
                  onPaste={handlePaste}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500"
                  placeholder="paste access key"
                />
                <KeyRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              {keyStatus && (
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle size={12} /> {keyStatus}
                </div>
              )}
              {(copied || pasted) && !keyStatus && (
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle size={12} /> {copied ? 'Access key copied' : 'Access key pasted'}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Secured by Hyperledger Fabric · All access is audited on-chain
        </p>
      </div>
    </div>
  )
}
