import { useState, useEffect } from 'react'
import { Plus, User, Stethoscope, ShieldCheck, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import { Button, Card, Input } from '../components/ui'
import KeyGateModal from '../components/security/KeyGateModal'

const API_URL = 'http://localhost:3001'

export default function Staff() {
  const { user, token, userKey } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(false)
  const [keyGate, setKeyGate] = useState({ open: false, purpose: '', onApprove: null })

  const requestKey = (purpose, onApprove) => {
    setKeyGate({ open: true, purpose, onApprove })
  }

  const handleAuthorized = () => {
    const action = keyGate.onApprove
    setKeyGate({ open: false, purpose: '', onApprove: null })
    if (action) action()
  }

  // Form
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('doctor')

  useEffect(() => {
    fetchStaff()
  }, [])

  const fetchStaff = async () => {
    try {
      setLoading(true)
      const res = await axios.get(`${API_URL}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setStaff(res.data.data)
    } catch (err) {
      setError('Failed to fetch staff directory')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await axios.post(`${API_URL}/auth/users`, { username, password, role }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setModal(false)
      setUsername('')
      setPassword('')
      fetchStaff()
    } catch (err) {
      alert(err.response?.data?.error || 'Creation failed')
    }
  }

  if (loading) return <div className="p-8 text-slate-500">Loading directory...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Clinical Staff</h1>
          <p className="text-sm text-slate-500 mt-1">Manage doctors, nurses, and other hospital personnel</p>
        </div>
        <Button onClick={() => requestKey('Authorize staff creation', () => setModal(true))}><Plus size={16} /> Add Staff</Button>
      </div>

      {error && <div className="bg-red-50 text-red-500 p-4 rounded-xl text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {staff.map(s => (
          <Card key={s.username} className="p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              s.role === 'doctor' ? 'bg-blue-50 text-blue-500' :
              s.role === 'nurse' ? 'bg-violet-50 text-violet-500' :
              'bg-slate-50 text-slate-400'
            }`}>
              {s.role === 'doctor' ? <Stethoscope size={20} /> :
               s.role === 'nurse' ? <Activity size={20} /> : <User size={20} />}
            </div>
            <div>
              <div className="font-medium text-slate-900">{s.username}</div>
              <div className="text-xs text-slate-500 capitalize">{s.role}</div>
            </div>
          </Card>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Add Staff</h3>
                <p className="text-xs text-slate-500">Create login credentials</p>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                >
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="pharmacist">Pharmacist</option>
                  <option value="medrecordofficer">Medical Records</option>
                </select>
              </div>
              <Input label="Username" value={username} onChange={e => setUsername(e.target.value)} required />
              <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />

              <div className="flex gap-3 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setModal(false)} type="button">Cancel</Button>
                <Button className="flex-1" type="submit">Create</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      <KeyGateModal
        open={keyGate.open}
        onClose={() => setKeyGate({ open: false, purpose: '', onApprove: null })}
        onAuthorized={handleAuthorized}
        userKey={userKey}
        purpose={keyGate.purpose}
      />
    </div>
  )
}
