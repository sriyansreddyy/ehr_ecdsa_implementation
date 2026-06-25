import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldCheck, Eye, EyeOff, ChevronDown, Mail, KeyRound, ArrowLeft, Send, Copy, CheckCircle } from 'lucide-react'

const ROLES = [
  { value: 'receptionist',     label: 'Receptionist'     },
  { value: 'admin',            label: 'Hospital Admin'    },
  { value: 'doctor',           label: 'Doctor'            },
  { value: 'nurse',            label: 'Nurse'             },
  { value: 'pharmacist',       label: 'Pharmacist'        },
  { value: 'medrecordofficer', label: 'Medical Records'   },
]

const ROLE_USERNAMES = {
  receptionist:     'receptionist',
  admin:            'hospitaladmin',
  doctor:           'doctor',
  nurse:            'nurse',
  pharmacist:       'pharmacist',
  medrecordofficer: 'medrecordofficer',
}

const ROLE_ROUTES = {
  receptionist:     '/patients',
  admin:            '/patients',
  doctor:           '/my-visits',
  nurse:            '/my-visits',
  pharmacist:       '/dispense',
  medrecordofficer: '/finalize',
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { loginSuccess, logout } = useAuth()

  // 1) Prevent auto-login: Ensure hitting the login page immediately destroys stale sessions
  useEffect(() => {
    logout()
  }, [])

  // 'credentials' | 'email' | 'otp' | 'key'
  const [step, setStep]         = useState('credentials')
  const [role, setRole]         = useState('receptionist')
  const [username, setUsername] = useState('receptionist')
  const [password, setPassword] = useState('')
  const [email, setEmail]       = useState('')
  const [showPass, setShowPass] = useState(false)
  const [otp, setOtp]           = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  
  // State for the new Step 4 (Key Gate)
  const [fetchedKey, setFetchedKey] = useState('')
  const [keyInput, setKeyInput]     = useState('')
  const [copied, setCopied]         = useState(false)
  const [tempAuth, setTempAuth]     = useState(null)

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const getApiUrl = (selectedRole) => {
    const PORT_MAP = {
      receptionist: 3001, admin: 3001, doctor: 3002, nurse: 3003, pharmacist: 3003, medrecordofficer: 3003
    }
    return `http://localhost:${PORT_MAP[selectedRole] || 3001}`
  }

  const handleRoleChange = (r) => {
    setRole(r)
    setUsername(ROLE_USERNAMES[r])
    setPassword('')
    setError('')
  }

  // Step 1: Credentials
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${getApiUrl(role)}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Invalid credentials')
      setStep('email')
    } catch (err) { setError(err.message || 'Invalid credentials') } 
    finally { setLoading(false) }
  }

  // Step 2: Email
  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${getApiUrl(role)}/auth/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to send OTP')
      setMaskedEmail(data.data.maskedEmail)
      setStep('otp')
    } catch (err) { setError(err.message || 'Failed to send OTP email') } 
    finally { setLoading(false) }
  }

  // Step 3: Verify OTP (but do NOT log in yet)
  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${getApiUrl(role)}/auth/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, otp })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'OTP verification failed')

      // Hold the auth data and the key, then switch to step 4
      setTempAuth({ user: data.data.user, token: data.data.token })
      setFetchedKey(data.data.privateKey || '')
      setStep('key')
    } catch (err) { setError(err.message || 'OTP verification failed') } 
    finally { setLoading(false) }
  }

  // Step 4: Validate manual key copy/paste
  const handleKeySubmit = (e) => {
    e.preventDefault()
    if (keyInput !== fetchedKey) {
      setError('Key does not match. Please paste the exact key.')
      return
    }

    // Now securely log the user in
    localStorage.setItem('token', tempAuth.token)
    sessionStorage.setItem('actorPrivateKey', fetchedKey)
    
    loginSuccess(tempAuth.user, tempAuth.token, fetchedKey)
    navigate(ROLE_ROUTES[tempAuth.user.role] || '/patients')
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-slate-950" />
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 mb-4 backdrop-blur-sm border border-white/10">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-semibold text-white mb-1" style={{ fontFamily: 'Fraunces, serif' }}>Hospital Portal</h1>
          <p className="text-slate-400 text-sm">EHR Blockchain — Clinical Staff Access</p>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              <div className="space-y-1.5"><label className="text-sm font-medium text-slate-300">Role</label>
                <div className="relative">
                  <select value={role} onChange={e => handleRoleChange(e.target.value)} className="w-full appearance-none bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 cursor-pointer">
                    {ROLES.map(r => <option key={r.value} value={r.value} className="bg-slate-900">{r.label}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-slate-300">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500" placeholder="username" />
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-slate-300">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500" placeholder="password" />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">{showPass ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <button type="submit" disabled={loading} className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : 'Continue'}</button>
            </form>
          )}

          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <button type="button" onClick={() => { setStep('credentials'); setEmail(''); setError('') }} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"><ArrowLeft size={14} /> Back</button>
              <div className="space-y-1.5"><label className="text-sm font-medium text-slate-300">Enter your email to receive OTP</label>
                <div className="relative">
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500" placeholder="actor@hospital.com" autoFocus />
                  <Send size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <button type="submit" disabled={loading || !email} className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : 'Send Passcode'}</button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <button type="button" onClick={() => { setStep('email'); setOtp(''); setError('') }} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"><ArrowLeft size={14} /> Back</button>
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 flex gap-3 items-start"><Mail size={18} className="text-slate-400 mt-0.5 shrink-0" /><div><p className="text-white text-sm font-medium mb-0.5">Check your email</p><p className="text-slate-400 text-xs">We sent a 6-digit code to <span className="text-slate-300">{maskedEmail}</span>. It expires in 5 minutes.</p></div></div>
              <div className="space-y-1.5"><label className="text-sm font-medium text-slate-300">One-time passcode</label>
                <div className="relative">
                  <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-10 text-sm tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500" placeholder="000000" autoFocus />
                  <KeyRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
              <button type="submit" disabled={loading || otp.length !== 6} className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" /> : 'Verify Passcode'}</button>
            </form>
          )}

          {/* ── STEP 4: Key Validation (Your Restored Mechanism) ── */}
          {step === 'key' && (
            <form onSubmit={handleKeySubmit} className="space-y-5">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-4 flex gap-3 items-start">
                <ShieldCheck size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-white text-sm font-medium mb-0.5">Authentication Successful</p>
                  <p className="text-slate-400 text-xs">Copy your private key. You will need it to authorize actions in the dashboard.</p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300">Your Private Key</label>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(fetchedKey); setCopied(true) }} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-white/10 px-2 py-1 rounded transition-colors">
                    {copied ? <CheckCircle size={14} className="text-emerald-400"/> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea readOnly value={fetchedKey} className="w-full h-20 bg-slate-900/50 border border-white/5 text-slate-400 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Paste key to continue</label>
                <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500" placeholder="Paste your key here" />
              </div>

              {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

              <button type="submit" disabled={!keyInput} className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center justify-center">
                Access Dashboard
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  )
} 