import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Input, Modal, Alert, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { Users, Plus, Search, ChevronRight, User, Phone, MapPin, Droplets } from 'lucide-react'
import KeyGateModal from '../components/security/KeyGateModal'

export default function PatientsPage() {
  const { api, user, userKey } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch]         = useState('')
  const [patients, setPatients]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [visits, setVisits]         = useState([])
  const [loading, setLoading]       = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError]           = useState('')
  const [showRegModal, setShowRegModal] = useState(false)
  const [keyGate, setKeyGate]       = useState({ open: false, purpose: '', onApprove: null })

  const requestKey = (purpose, onApprove) => {
    setKeyGate({ open: true, purpose, onApprove })
  }

  const handleAuthorized = () => {
    const action = keyGate.onApprove
    setKeyGate({ open: false, purpose: '', onApprove: null })
    if (action) action()
  }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true); setError('')
    try {
      const res = await api().get('/patients')
      const payload = res.data.data || []
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.patients)
          ? payload.patients
          : payload?.patientId
            ? [payload]
          : Object.values(payload)
      setPatients(list)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load patients')
    } finally { setLoading(false) }
  }

  const selectPatient = async (p) => {
    setSelected(p); setDetailLoading(true)
    try {
      const res = await api().get(`/patients/${p.patientId}/visits/full`)
      setVisits(res.data.data || [])
    } catch { setVisits([]) }
    finally { setDetailLoading(false) }
  }

  const filtered = patients.filter(p =>
    (p?.patientId || '').toLowerCase().includes(search.toLowerCase()) ||
    (p?.name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Patients</h1>
          <p className="text-sm text-slate-500 mt-0.5">All registered patients — click to view details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadAll} loading={loading}>Refresh</Button>
          <Button onClick={() => requestKey('Authorize patient registration', () => setShowRegModal(true))}><Plus size={16} /> Register Patient</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by Patient ID or name..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
      </Card>

      {error && <Alert type="error">{error}</Alert>}
      {loading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-2">
              <Card className="p-12"><EmptyState icon={Users} title="No patients found" desc={search ? 'Try a different search term' : 'Register the first patient to get started'} /></Card>
            </div>
          ) : filtered.map((p, index) => (
            <Card key={p.patientId || p.id || `${p.name || 'patient'}-${index}`}
              className={`p-4 cursor-pointer transition-colors hover:bg-slate-50 ${selected?.patientId === p.patientId ? 'ring-2 ring-slate-900' : ''}`}
              onClick={() => selectPatient(p)}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{p.name || `Patient ${p.patientId || index + 1}`}</p>
                  <p className="text-xs text-slate-400 font-mono">{p.patientId || 'Unknown ID'} · {p.age ?? '—'}y · {p.gender || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{p.visitCount ?? 0} visit{(p.visitCount ?? 0) !== 1 ? 's' : ''}</span>
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                  <User size={20} className="text-slate-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{selected.name || `Patient ${selected.patientId || ''}`}</h2>
                  <p className="text-sm text-slate-500 font-mono">{selected.patientId || 'Unknown ID'}</p>
                </div>
              </div>
              {(user.role === 'receptionist' || user.role === 'admin') && (
                <Button size="sm" onClick={() => requestKey('Authorize open visit', () => navigate(`/open-visit?patientId=${selected.patientId}`))}>Open Visit</Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <InfoTile icon={User} label="Age / Gender" value={`${selected.age} / ${selected.gender}`} />
              <InfoTile icon={Droplets} label="Blood Group" value={selected.bloodGroup} />
              <InfoTile icon={Phone} label="Contact" value={selected.contact} />
              <InfoTile icon={MapPin} label="Address" value={selected.address} truncate />
            </div>
          </Card>

          <div>
            <h3 className="font-semibold text-slate-900 mb-3">Visit History ({visits.length})</h3>
            {detailLoading ? <div className="flex justify-center py-6"><Spinner /></div> :
              visits.length === 0 ? (
                <Card className="p-8"><EmptyState icon={Search} title="No visits yet" desc="Open a new visit to get started" /></Card>
              ) : (
                <div className="space-y-2">
                  {visits.map(v => (
                    <Card key={v.visitId} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/visits/${v.visitId}`)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900 font-mono text-sm">{v.visitId}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {v.assignedDoctor && ` · Dr: ${v.assignedDoctor}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={v.status} />
                          <ChevronRight size={16} className="text-slate-400" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* FIX: Added onSuccess prop to handle the automatic forwarding */}
      <RegisterModal 
        open={showRegModal} 
        onClose={() => { setShowRegModal(false); loadAll() }} 
        onSuccess={(newPatientId) => {
          setShowRegModal(false);
          loadAll();
          navigate(`/open-visit?patientId=${newPatientId}`);
        }}
        api={api} 
      />
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

function InfoTile({ icon: Icon, label, value, truncate }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} className="text-slate-400" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-sm font-medium text-slate-800 ${truncate ? 'truncate' : ''}`}>{value || '—'}</p>
    </div>
  )
}

// FIX: Add onSuccess to props
function RegisterModal({ open, onClose, onSuccess, api }) {
  const [form, setForm] = useState({
    patientId: '', name: '', age: '', gender: 'Male',
    bloodGroup: 'O+', contact: '', address: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await api().post('/patients', { ...form, age: parseInt(form.age) })
      setSuccess(`Patient ${form.patientId} registered successfully!`)
      const pid = form.patientId // Capture it before clearing form
      
      setForm({ patientId: '', name: '', age: '', gender: 'Male', bloodGroup: 'O+', contact: '', address: '' })
      
      // FIX: Wait 1.5 seconds so the user can see the success message, then forward them
      setTimeout(() => {
        if(onSuccess) onSuccess(pid)
      }, 1500)

    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }
// ... rest of the modal remains the same

  return (
    <Modal open={open} onClose={onClose} title="Register New Patient" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Patient ID *" value={form.patientId} onChange={e => update('patientId', e.target.value)} placeholder="PAT-001" required />
          <Input label="Full Name *" value={form.name} onChange={e => update('name', e.target.value)} placeholder="John Doe" required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input label="Age *" type="number" value={form.age} onChange={e => update('age', e.target.value)} min="0" max="150" required />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Gender *</label>
            <select value={form.gender} onChange={e => update('gender', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900">
              {['Male','Female','Other'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Blood Group *</label>
            <select value={form.bloodGroup} onChange={e => update('bloodGroup', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900">
              {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <Input label="Contact *" value={form.contact} onChange={e => update('contact', e.target.value)} placeholder="9876543210" required />
        <Input label="Address *" value={form.address} onChange={e => update('address', e.target.value)} placeholder="123 Main Street, City" required />
        {error   && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>Register Patient</Button>
        </div>
      </form>
    </Modal>
  )
}
