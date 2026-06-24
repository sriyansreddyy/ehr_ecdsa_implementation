import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ShieldCheck, Eye, EyeOff, ChevronDown, Mail, KeyRound, ArrowLeft } from 'lucide-react'

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
  const { loginStep1, loginStep2 } = useAuth()
  const navigate = useNavigate()

  // 'credentials' | 'otp'
  const [step, setStep]         = useState('credentials')
  const [role, setRole]         = useState('receptionist')
  const [username, setUsername] = useState('receptionist')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [otp, setOtp]           = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleRoleChange = (r) => {
    setRole(r)
    setUsername(ROLE_USERNAMES[r])
    setPassword('')
    setError('')
  }

  // Step 1: verify password → trigger OTP send
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await loginStep1(username, password)
      setMaskedEmail(data.maskedEmail || 'your registered email')
      setStep('otp')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: verify OTP → get JWT → navigate
  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const userData = await loginStep2(username, otp)
      navigate(ROLE_ROUTES[userData.role] || '/patients')
    } catch (err) {
      setError(err.message || 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-slate-950" />
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

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">

          {/* ── STEP 1: Credentials ── */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">Role</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={e => handleRoleChange(e.target.value)}
                    className="w-full appearance-none bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/20 cursor-pointer"
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
                {loading
                  ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                  : 'Continue'}
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP ── */}
          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              {/* Back button */}
              <button
                type="button"
                onClick={() => { setStep('credentials'); setOtp(''); setError('') }}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>

              {/* Email hint */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 flex gap-3 items-start">
                <Mail size={18} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-white text-sm font-medium mb-0.5">Check your email</p>
                  <p className="text-slate-400 text-xs">
                    We sent a 6-digit code to <span className="text-slate-300">{maskedEmail}</span>.
                    It expires in 5 minutes.
                  </p>
                </div>
              </div>

              {/* OTP input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300">One-time passcode</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 pr-10 text-sm tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500"
                    placeholder="000000"
                    autoFocus
                  />
                  <KeyRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                  : 'Verify & Sign in'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Secured by Hyperledger Fabric · All access is audited on-chain
        </p>
      </div>
    </div>
  )
}