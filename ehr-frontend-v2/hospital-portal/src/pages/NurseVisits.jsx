import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Alert, StatusBadge, Spinner, EmptyState, Modal, Badge } from '../components/ui'
import { Activity, Search, Pill, MessageSquare, ArrowRight, Plus, X, ChevronRight, ArrowLeft, Lock } from 'lucide-react'
import KeyGateModal from '../components/security/KeyGateModal'

export default function NurseVisitsPage() {
  const { api, userKey } = useAuth()
  const [visits, setVisits]     = useState([])
  const [search, setSearch]     = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [visit, setVisit]       = useState(null)
  const [clinical, setClinical] = useState(null)
  const [loading, setLoading]   = useState(false)
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
    setListLoading(true)
    try {
      const res = await api().get('/nurse/visits')
      setVisits(res.data.data || [])
    } catch {} finally { setListLoading(false) }
  }

  const fetchVisit = async (id) => {
    if (!id?.trim()) return
    setLoading(true); setError('')
    try {
      const res = await api().get(`/nurse/visits/${id.trim()}`)
      setVisit(res.data.data)
      setClinical(res.data.data.clinical || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Visit not found')
      setVisit(null)
    } finally { setLoading(false) }
  }

  const refresh = () => fetchVisit(visit?.visitId)

  const isActive = visit && ['OPEN','WITH_DOCTOR','WITH_NURSE','WITH_LAB'].includes(visit.status)

  const filtered = visits.filter(v =>
    v.visitId.toLowerCase().includes(search.toLowerCase()) ||
    v.patientId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Nurse Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Record vitals, care notes, and manage patient workflow</p>
        </div>
        {!visit && <Button variant="secondary" onClick={loadAll} loading={listLoading}>Refresh</Button>}
      </div>

      {!visit && (
        <>
          <Card className="p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Filter by Visit ID or Patient ID..."
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </Card>

          {listLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.length === 0 ? (
                <div className="col-span-2">
                  <Card className="p-12"><EmptyState icon={Activity} title="No visits assigned" desc={search ? 'Try a different search term' : 'No visits are currently assigned to you'} /></Card>
                </div>
              ) : filtered.map(v => (
                <Card key={v.visitId}
                  className="p-4 cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => fetchVisit(v.visitId)}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 font-mono text-sm truncate">{v.visitId}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Patient: {v.patientId}</p>
                      {v.assignedDoctor && <p className="text-xs text-slate-400">Dr: {v.assignedDoctor}</p>}
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
        </>
      )}

      {error && <Alert type="error">{error}</Alert>}
      {loading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {visit && !loading && (
        <div className="space-y-4">
          <button onClick={() => { setVisit(null); setClinical(null); setError('') }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft size={15} /> All Visits
          </button>

          {/* Visit Header */}
          <Card className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-xs text-slate-400">{visit.visitId}</p>
                <h2 className="text-lg font-semibold text-slate-900">Patient: {visit.patientId}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={visit.status} />
                  {visit.assignedDoctor && <Badge variant="blue">Dr: {visit.assignedDoctor}</Badge>}
                </div>
              </div>
              {isActive && (
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="secondary" className="border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => requestKey('Authorize vitals update', () => setModal('vitals'))}>
                    <Activity size={13} /> Record Vitals
                  </Button>
                  <Button size="sm" variant="secondary" className="border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => requestKey('Authorize care note update', () => setModal('carenote'))}>
                    <MessageSquare size={13} /> Add Care Note
                  </Button>
                  <Button size="sm" variant="secondary" className="border-violet-200 text-violet-700 hover:bg-violet-50" onClick={() => requestKey('Authorize EHR update', () => setModal('ehr'))}>
                    Update EHR
                  </Button>
                  <Button size="sm" variant="secondary" className="border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => requestKey('Authorize access request', () => setModal('request-access'))}>
                    <Lock size={13} /> Request EHR Access
                  </Button>
                  {visit.status === 'WITH_NURSE' && (
                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5" onClick={() => requestKey('Authorize forwarding to doctor', () => setModal('forward-doctor'))}>
                      <ArrowRight size={13} /> Forward to Doctor
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vitals Card */}
            <Card className="p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">Current Vitals</p>
              {clinical?.vitals ? (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Blood Pressure', clinical.vitals.bloodPressure],
                    ['Temperature',    clinical.vitals.temperature],
                    ['Pulse',          clinical.vitals.pulse],
                    ['Weight',         clinical.vitals.weight],
                    ['Height',         clinical.vitals.height],
                    ['SpO₂',           clinical.vitals.oxygenSat],
                  ].map(([l, v]) => (
                    <div key={l} className="bg-violet-50 rounded-lg p-3">
                      <p className="text-xs text-violet-400 mb-0.5">{l}</p>
                      <p className="text-sm font-semibold text-violet-900">{v || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-violet-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-violet-400">No vitals recorded yet</p>
                  <button onClick={() => requestKey('Authorize vitals update', () => setModal('vitals'))}
                    className="mt-2 text-xs text-violet-600 font-medium hover:text-violet-700">
                    Record now →
                  </button>
                </div>
              )}
              {clinical?.vitals?.recordedAt && (
                <p className="text-xs text-slate-400 mt-2">
                  Recorded {new Date(clinical.vitals.recordedAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                </p>
              )}
            </Card>

            {/* Prescription Card */}
            <Card className="p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">Current Prescription</p>
              {clinical?.prescriptions?.length > 0 ? (
                <>
                  {(() => {
                    const latest = clinical.prescriptions[clinical.prescriptions.length - 1]
                    return (
                      <div>
                        <Badge variant="blue" className="mb-2">Version {latest.version}</Badge>
                        <ul className="space-y-1 mt-2">
                          {latest.medications?.map((m, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />{m}
                            </li>
                          ))}
                        </ul>
                        {latest.instructions && (
                          <p className="text-xs text-slate-500 mt-2 italic">{latest.instructions}</p>
                        )}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <p className="text-sm text-slate-400">No prescription yet</p>
              )}
            </Card>
          </div>

          {/* Chief Complaint / Diagnosis */}
          {clinical?.chiefComplaint && (
            <Card className="p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">Chief Complaint</p>
              <p className="text-sm text-slate-700">{clinical.chiefComplaint}</p>
              {clinical?.diagnosisNotes && (
                <>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mt-4 mb-2">Doctor's Notes</p>
                  <p className="text-sm text-slate-700">{clinical.diagnosisNotes}</p>
                </>
              )}
            </Card>
          )}

          {/* Care Notes */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Care Notes ({clinical?.careNotes?.length || 0})</p>
              {isActive && (
                <Button size="sm" variant="ghost" onClick={() => requestKey('Authorize care note update', () => setModal('carenote'))}>
                  <Plus size={13} /> Add
                </Button>
              )}
            </div>
            {clinical?.careNotes?.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {[...clinical.careNotes].reverse().map((n, i) => (
                  <div key={i} className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                    <p className="text-sm text-slate-700">{n.note}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {n.recordedBy} · {new Date(n.recordedAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No care notes yet</p>
            )}
          </Card>
        </div>
      )}

      {/* Modals */}
      {modal === 'vitals' && (
        <VitalsModal visit={visit} api={api} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'carenote' && (
        <CareNoteModal visit={visit} api={api} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'forward-doctor' && (
        <ForwardDoctorModal visit={visit} api={api} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'ehr' && (
        <EHRUpdateModal visit={visit} api={api} onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'request-access' && (
        <RequestAccessModal visit={visit} api={api} onClose={() => setModal(null)} />
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

function VitalsModal({ visit, api, onClose, onDone }) {
  const [vitals, setVitals] = useState({ bloodPressure: '', temperature: '', pulse: '', weight: '', height: '', oxygenSat: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const update = (k, v) => setVitals(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().put(`/nurse/visits/${visit.visitId}/vitals`, { vitals })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Record Vitals" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'bloodPressure', label: 'Blood Pressure', placeholder: '120/80 mmHg' },
            { key: 'temperature',   label: 'Temperature',    placeholder: '98.6°F' },
            { key: 'pulse',         label: 'Pulse Rate',     placeholder: '72 bpm' },
            { key: 'oxygenSat',     label: 'SpO₂',           placeholder: '98%' },
            { key: 'weight',        label: 'Weight',         placeholder: '70 kg' },
            { key: 'height',        label: 'Height',         placeholder: '170 cm' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">{label}</label>
              <input value={vitals[key]} onChange={e => update(key, e.target.value)} placeholder={placeholder}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          ))}
        </div>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors" loading={loading}>
            Save Vitals
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CareNoteModal({ visit, api, onClose, onDone }) {
  const [note, setNote]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().post(`/nurse/visits/${visit.visitId}/carenote`, { note })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Add Care Note" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} required
          placeholder="Patient observation, medication administered, response to treatment..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors" loading={loading}>
            Add Note
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ForwardDoctorModal({ visit, api, onClose, onDone }) {
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().put(`/nurse/visits/${visit.visitId}/forward/doctor`, { notes })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Forward to Doctor" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">Dr: <strong>{visit.assignedDoctor}</strong></p>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          placeholder="Handover notes for doctor..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors" loading={loading}>
            Forward to Doctor
          </Button>
        </div>
      </form>
    </Modal>
  )
}

const NURSE_ARRAY_FIELDS = {
  allergies: [
    { key: 'allergy',  label: 'Allergy',  placeholder: 'e.g. Penicillin', required: true },
    { key: 'severity', label: 'Severity', type: 'select', options: ['Low', 'Moderate', 'High'] },
    { key: 'reaction', label: 'Reaction', placeholder: 'e.g. Rash' },
  ],
  chronicConditions: [
    { key: 'condition', label: 'Condition', placeholder: 'e.g. Diabetes Type 2', required: true },
    { key: 'since',     label: 'Since',     placeholder: 'e.g. 2018' },
  ],
  immunizations: [
    { key: 'vaccine', label: 'Vaccine', placeholder: 'e.g. COVID-19 (Covishield)', required: true },
    { key: 'date',    label: 'Date',    placeholder: 'e.g. Mar 2021' },
  ],
  medicalHistory: [
    { key: 'text',       label: 'Clinical Info', placeholder: 'Full medical history...', required: true },
    { key: 'patientName', label: 'Patient Name', placeholder: 'Extracted name' },
    { key: 'date',        label: 'Report Date',  placeholder: 'YYYY-MM-DD' },
    { key: 'hospital',    label: 'Facility',     placeholder: 'Hospital/Clinic' },
    { key: 'diagnosis',   label: 'Diagnosis',    placeholder: 'Primary condition' },
    { key: 'treatment',   label: 'Treatment',    placeholder: 'Medications/Plan' },
    { key: 'doctor',      label: 'Physician',    placeholder: 'Dr. Name' },
    { key: 'sourceType',  label: 'Source',       type: 'select', options: ['OCR', 'MANUAL', 'EXTERNAL_REPORT'] },
  ],
}

const LIFESTYLE_FIELDS = [
  { key: 'smokingStatus', label: 'Smoking',  type: 'select', options: ['Never', 'Former', 'Current'] },
  { key: 'alcoholUse',    label: 'Alcohol',  type: 'select', options: ['Never', 'Occasional', 'Regular'] },
  { key: 'activityLevel', label: 'Activity', type: 'select', options: ['Sedentary', 'Moderate', 'Active'] },
  { key: 'diet',          label: 'Diet',     placeholder: 'e.g. Vegetarian, Balanced' },
]

const EMERGENCY_FIELDS = [
  { key: 'name',     label: 'Name',     placeholder: 'Contact name', required: true },
  { key: 'relation', label: 'Relation', placeholder: 'e.g. Spouse, Parent' },
  { key: 'phone',    label: 'Phone',    placeholder: '9876543210', required: true },
]

const makeEmptyEntry = (section) =>
  Object.fromEntries((NURSE_ARRAY_FIELDS[section] || []).map(f => [f.key, f.type === 'select' ? f.options[0] : '']))

const normalizeEntry = (item, section) => {
  const base = makeEmptyEntry(section)
  if (typeof item === 'string') {
    base[NURSE_ARRAY_FIELDS[section][0].key] = item
    return base
  }
  NURSE_ARRAY_FIELDS[section].forEach(f => { 
    if (item[f.key] != null) base[f.key] = item[f.key]
    if (section === 'medicalHistory' && item.attributes && item.attributes[f.key] != null) {
      base[f.key] = item.attributes[f.key]
    }
  })
  return base
}

const SECTION_OPTS = ['ehr', 'visits', 'prescriptions', 'labResults', 'all']

function RequestAccessModal({ visit, api, onClose }) {
  const [sections, setSections] = useState(['ehr', 'visits'])
  const [reason, setReason]     = useState('')
  const [status, setStatus]     = useState(null) // null | 'sent' | 'error'
  const [errMsg, setErrMsg]     = useState('')
  const [loading, setLoading]   = useState(false)

  const toggle = (s) => setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const send = async (e) => {
    e.preventDefault()
    if (sections.length === 0) { setErrMsg('Select at least one section'); return }
    setLoading(true); setErrMsg('')
    try {
      await api().post(`/nurse/visits/${visit.visitId}/request-access`, {
        sections,
        reason: reason.trim() || 'Clinical care requires EHR access',
      })
      setStatus('sent')
    } catch (err) {
      setErrMsg(err.response?.data?.error || 'Request failed')
      setStatus('error')
    } finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Request EHR Access" size="sm">
      {status === 'sent' ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
            <Lock size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Request Sent</p>
              <p className="text-xs text-blue-600 mt-1">
                The patient will be notified and can approve or reject from their portal.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="space-y-4">
          <p className="text-xs text-slate-500">
            Patient: <strong>{visit.patientId}</strong> · Visit: <strong className="font-mono">{visit.visitId}</strong>
          </p>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Sections Requested</p>
            <div className="flex flex-wrap gap-2">
              {SECTION_OPTS.map(s => (
                <button key={s} type="button" onClick={() => toggle(s)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-xl border transition-colors ${sections.includes(s) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="e.g. Need allergy history before medication administration"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>
          {errMsg && <Alert type="error">{errMsg}</Alert>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading}
              className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors">
              Send Request
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function EHRUpdateModal({ visit, api, onClose, onDone }) {
  const NURSE_SECTIONS = ['allergies', 'chronicConditions', 'immunizations', 'lifestyle', 'emergencyContact', 'medicalHistory']
  const [section, setSection] = useState('allergies')
  const [entries, setEntries] = useState([makeEmptyEntry('allergies')])
  const [objData, setObjData] = useState({ smokingStatus: 'Never', alcoholUse: 'Never', activityLevel: 'Sedentary', diet: '' })
  const [emergData, setEmergData] = useState({ name: '', relation: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const onSectionChange = (s) => {
    setSection(s); setError('')
    if (NURSE_ARRAY_FIELDS[s]) setEntries([makeEmptyEntry(s)])
  }

  const updateEntry = (idx, key, val) =>
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [key]: val } : e))
  const addEntry    = () => setEntries(prev => [...prev, makeEmptyEntry(section)])
  const removeEntry = (idx) => setEntries(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      let data
      if (NURSE_ARRAY_FIELDS[section]) {
        const fields = NURSE_ARRAY_FIELDS[section]
        data = entries
          .filter(e => fields.filter(f => f.required).every(f => e[f.key]?.trim()))
          .map(e => {
            const out = {}
            fields.forEach(f => { if (e[f.key]?.trim()) out[f.key] = e[f.key].trim() })
            
            if (section === 'medicalHistory') {
              const { text, sourceType, ...attrs } = out
              return { text, sourceType, attributes: attrs }
            }
            return out
          })
      } else if (section === 'lifestyle') {
        data = Object.fromEntries(Object.entries(objData).filter(([, v]) => v))
      } else {
        data = Object.fromEntries(Object.entries(emergData).filter(([, v]) => v))
      }
      await api().put(`/nurse/visits/${visit.visitId}/ehr`, { section, data })
      onDone(); onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed')
    } finally { setLoading(false) }
  }

  const isArray = !!NURSE_ARRAY_FIELDS[section]
  const fields  = isArray ? NURSE_ARRAY_FIELDS[section] : section === 'lifestyle' ? LIFESTYLE_FIELDS : EMERGENCY_FIELDS

  return (
    <Modal open onClose={onClose} title="Update Patient EHR" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Section</label>
          <select value={section} onChange={e => onSectionChange(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
            {NURSE_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isArray ? (
          <>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {entries.map((entry, idx) => (
                <div key={idx} className="flex gap-2 items-start bg-slate-50 rounded-lg p-3">
                  <div className="flex-1 grid grid-cols-1 gap-2">
                    {fields.map(f => (
                      <div key={f.key} className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 w-20 flex-shrink-0">{f.label}{f.required ? ' *' : ''}</label>
                        {f.type === 'select' ? (
                          <select value={entry[f.key]} onChange={e => updateEntry(idx, f.key, e.target.value)}
                            className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                            {f.options.map(o => <option key={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input value={entry[f.key]} onChange={e => updateEntry(idx, f.key, e.target.value)}
                            placeholder={f.placeholder}
                            className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500" />
                        )}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => removeEntry(idx)}
                    className="text-slate-300 hover:text-red-400 transition-colors mt-1 flex-shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addEntry}
              className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 transition-colors">
              <Plus size={14} /> Add entry
            </button>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {fields.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-700 w-24 flex-shrink-0">{f.label}</label>
                {f.type === 'select' ? (
                  <select
                    value={section === 'lifestyle' ? objData[f.key] : emergData[f.key]}
                    onChange={e => section === 'lifestyle'
                      ? setObjData(d => ({ ...d, [f.key]: e.target.value }))
                      : setEmergData(d => ({ ...d, [f.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                    {f.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    value={section === 'lifestyle' ? objData[f.key] || '' : emergData[f.key] || ''}
                    onChange={e => section === 'lifestyle'
                      ? setObjData(d => ({ ...d, [f.key]: e.target.value }))
                      : setEmergData(d => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" />
                )}
              </div>
            ))}
          </div>
        )}

        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors" loading={loading}>
            Update EHR
          </Button>
        </div>
      </form>
    </Modal>
  )
}
