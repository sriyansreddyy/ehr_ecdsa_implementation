import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Input, Modal, Alert, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { Calendar, Plus, Search, ChevronRight, UserCheck, X } from 'lucide-react'
import KeyGateModal from '../components/security/KeyGateModal'

export default function VisitsPage() {
  const { api, user, userKey } = useAuth()
  const navigate      = useNavigate()
  const [search, setSearch]     = useState('')
  const [visits, setVisits]     = useState([])
  const [selected, setSelected] = useState(null)
  const [visit, setVisit]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [keyGate, setKeyGate]   = useState({ open: false, purpose: '', onApprove: null })

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
      const res = await api().get('/visits')
      setVisits(res.data.data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load visits')
    } finally { setLoading(false) }
  }

  const selectVisit = async (v) => {
    setSelected(v); setDetailLoading(true); setError('')
    try {
      const res = await api().get(`/visits/${v.visitId}`)
      setVisit(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Visit not found')
      setVisit(null)
    } finally { setDetailLoading(false) }
  }

  const refresh = () => visit && selectVisit({ visitId: visit.visitId })

  const filtered = visits.filter(v =>
    v.visitId.toLowerCase().includes(search.toLowerCase()) ||
    v.patientId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Visits</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage visit assignments and workflow</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadAll} loading={loading}>Refresh</Button>
          <Button onClick={() => requestKey('Authorize open visit', () => navigate('/open-visit'))}><Plus size={16} /> Open Visit</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by Visit ID or Patient ID..."
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
        </div>
      </Card>

      {error && <Alert type="error">{error}</Alert>}
      {loading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-2">
              <Card className="p-12"><EmptyState icon={Calendar} title="No visits found" desc={search ? 'Try a different search term' : 'Open the first visit to get started'} /></Card>
            </div>
          ) : filtered.map(v => (
            <Card key={v.visitId}
              className={`p-4 cursor-pointer transition-colors hover:bg-slate-50 ${selected?.visitId === v.visitId ? 'ring-2 ring-slate-900' : ''}`}
              onClick={() => selectVisit(v)}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 font-mono text-sm truncate">{v.visitId}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Patient: {v.patientId}</p>
                  {(v.assignedDoctor || v.assignedNurse) && (
                    <p className="text-xs text-slate-400">
                      {v.assignedDoctor ? `Dr: ${v.assignedDoctor}` : ''}
                      {v.assignedNurse ? `${v.assignedDoctor ? ' · ' : ''}Nurse: ${v.assignedNurse}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status} />
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {detailLoading && <div className="flex justify-center py-6"><Spinner /></div>}

      {visit && !detailLoading && (
        <VisitDetail
          visit={visit}
          user={user}
          onAction={setModal}
          onAuthorize={requestKey}
          onRefresh={refresh}
        />
      )}

      {modal === 'assign-doctor' && (
        <AssignModal title="Assign Doctor" field="doctorId" placeholder="doctor"
          onClose={() => setModal(null)}
          onSubmit={async (value) => {
            await api().put(`/visits/${visit.visitId}/doctor`, { doctorId: value })
            refresh(); setModal(null)
          }}
        />
      )}
      {modal === 'assign-nurse' && (
        <AssignModal title="Assign Nurse" field="nurseId" placeholder="nurse"
          onClose={() => setModal(null)}
          onSubmit={async (value) => {
            await api().put(`/visits/${visit.visitId}/nurse`, { nurseId: value })
            refresh(); setModal(null)
          }}
        />
      )}
      {modal === 'discharge' && (
        <DischargeModal visit={visit}
          onClose={() => setModal(null)}
          onSubmit={async (notes) => {
            await api().put(`/visits/${visit.visitId}/discharge`, { dischargeNotes: notes })
            refresh(); setModal(null)
          }}
        />
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

function VisitDetail({ visit, user, onAction, onAuthorize, onRefresh }) {
  const canAssign    = ['receptionist','admin'].includes(user.role)
  const canDischarge = user.role === 'admin'
  const dischargeOk  = ['CLAIM_APPROVED','CLAIM_REJECTED','RECORD_FINALIZED'].includes(visit.status)

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="font-mono text-sm text-slate-500">{visit.visitId}</p>
            <h2 className="text-lg font-semibold text-slate-900 mt-0.5">
              Patient: {visit.patientId}
            </h2>
          </div>
          <StatusBadge status={visit.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-slate-100">
          <Detail label="Doctor" value={visit.assignedDoctor || '—'} />
          <Detail label="Nurse" value={visit.assignedNurse || '—'} />
          <Detail label="Visit #" value={`#${visit.visitNumber}`} />
          <Detail label="Opened" value={new Date(visit.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
        </div>

        {visit.claimId && (
          <div className="grid grid-cols-3 gap-4 py-4 border-b border-slate-100">
            <Detail label="Claim ID" value={visit.claimId} />
            <Detail label="Claim Amount" value={`₹${visit.claimAmount?.toLocaleString()}`} />
            <Detail label="Claim Status" value={visit.claimStatus || '—'} />
          </div>
        )}

        {/* IPFS CID */}
        {visit.visitCID && (
          <div className="pt-4">
            <p className="text-xs text-slate-400 mb-1">Current IPFS CID</p>
            <p className="font-mono text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg break-all">
              {visit.visitCID}
            </p>
          </div>
        )}
      </Card>

      {/* Actions */}
      {canAssign && visit.status !== 'DISCHARGED' && (
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-700 mb-3">Assignment Actions</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => onAuthorize('Authorize doctor assignment', () => onAction('assign-doctor'))}>
              <UserCheck size={14} /> Assign Doctor
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAuthorize('Authorize nurse assignment', () => onAction('assign-nurse'))}>
              <UserCheck size={14} /> Assign Nurse
            </Button>
            {canDischarge && dischargeOk && (
              <Button size="sm" variant="danger" onClick={() => onAuthorize('Authorize discharge', () => onAction('discharge'))}>
                Discharge Patient
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* CID History */}
      {visit.cidHistory?.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-medium text-slate-700 mb-3">IPFS Version History ({visit.cidHistory.length} versions)</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {[...visit.cidHistory].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-slate-600 truncate">{h.cid}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {h.reason} · {h.updatedBy} · {new Date(h.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
    </div>
  )
}

function AssignModal({ title, field, placeholder, onClose, onSubmit }) {
  const [value, setValue] = useState(placeholder)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [staff, setStaff]     = useState([])
  const { user, token }       = useAuth()

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await fetch('http://localhost:3001/auth/users', { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        const targetRole = title.toLowerCase().includes('doctor') ? 'doctor' : 'nurse'
        const matches = data.data.filter(s => s.role === targetRole)
        setStaff(matches)
        if (matches.length > 0 && placeholder === value) {
          setValue(matches[0].username)
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchStaff()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try { await onSubmit(value) }
    catch (err) { setError(err.response?.data?.error || 'Action failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {staff.length > 0 ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{`${title.replace('Assign ', '')} ID`}</label>
            <select value={value} onChange={e => setValue(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-slate-900 transition-colors">
              {staff.map(s => <option key={s.username} value={s.username}>{s.username}</option>)}
            </select>
          </div>
        ) : (
          <Input label={`${title.replace('Assign ', '')} ID`} value={value} onChange={e => setValue(e.target.value)} required />
        )}
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading}>{title}</Button>
        </div>
      </form>
    </Modal>
  )
}

function DischargeModal({ visit, onClose, onSubmit }) {
  const [notes, setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try { await onSubmit(notes) }
    catch (err) { setError(err.response?.data?.error || 'Discharge failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Discharge Patient" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Alert type="warning">This will mark the visit as DISCHARGED and cannot be undone.</Alert>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Discharge Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            placeholder="Patient discharged in stable condition..."
          />
        </div>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" loading={loading}>Confirm Discharge</Button>
        </div>
      </form>
    </Modal>
  )
}
