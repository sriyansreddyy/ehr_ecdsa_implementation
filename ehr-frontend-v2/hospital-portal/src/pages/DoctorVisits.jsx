import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Input, Modal, Alert, StatusBadge, Spinner, EmptyState, Badge } from '../components/ui'
import { Stethoscope, Search, FileText, Pill, FlaskConical, CheckCircle, ChevronDown, ChevronUp, Plus, X, ChevronRight, ArrowLeft } from 'lucide-react'
import KeyGateModal from '../components/security/KeyGateModal'

export default function DoctorVisitsPage() {
  const { api, userKey } = useAuth()
  const [visits, setVisits]     = useState([])
  const [search, setSearch]     = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [visit, setVisit]       = useState(null)
  const [clinical, setClinical] = useState(null)
  const [ehr, setEhr]           = useState(null)
  const [ehrAccessDenied, setEhrAccessDenied] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [tab, setTab]           = useState('overview')
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
      const res = await api().get('/doctor/visits')
      setVisits(res.data.data || [])
    } catch {} finally { setListLoading(false) }
  }

  const fetchVisit = async (id) => {
    if (!id?.trim()) return
    setLoading(true); setError('')
    try {
      const res = await api().get(`/doctor/visits/${id.trim()}`)
      setVisit(res.data.data)
      setClinical(res.data.data.clinical || null)
      setTab('overview')
    } catch (err) {
      setError(err.response?.data?.error || 'Visit not found')
      setVisit(null); setClinical(null)
    } finally { setLoading(false) }
  }

  const fetchEHR = async () => {
    if (!visit) return
    setEhrAccessDenied(false)
    try {
      const res = await api().get(`/doctor/visits/${visit.visitId}/ehr`)
      setEhr(res.data.data?.ehr || null)
    } catch (err) {
      const msg = err.response?.data?.error || ''
      if (err.response?.status === 403 || msg.toLowerCase().includes('access') || msg.toLowerCase().includes('grant')) {
        setEhrAccessDenied(true)
      }
    }
  }

  const refresh = () => fetchVisit(visit?.visitId)

  const filtered = visits.filter(v =>
    v.visitId.toLowerCase().includes(search.toLowerCase()) ||
    v.patientId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Doctor Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Clinical management — diagnosis, prescriptions, lab orders</p>
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
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </Card>

          {listLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.length === 0 ? (
                <div className="col-span-2">
                  <Card className="p-12"><EmptyState icon={Stethoscope} title="No visits assigned" desc={search ? 'Try a different search term' : 'No visits are currently assigned to you'} /></Card>
                </div>
              ) : filtered.map(v => (
                <Card key={v.visitId}
                  className="p-4 cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => fetchVisit(v.visitId)}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 font-mono text-sm truncate">{v.visitId}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Patient: {v.patientId}</p>
                      {v.assignedNurse && <p className="text-xs text-slate-400">Nurse: {v.assignedNurse}</p>}
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
        <>
          <button onClick={() => { setVisit(null); setClinical(null); setEhr(null); setError('') }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft size={15} /> All Visits
          </button>

          {/* Visit Header */}
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-xs text-slate-400">{visit.visitId}</p>
                <h2 className="text-lg font-semibold text-slate-900">Patient: {visit.patientId}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <StatusBadge status={visit.status} />
                  {visit.assignedNurse && <Badge variant="violet">Nurse: {visit.assignedNurse}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="secondary" onClick={() => requestKey('Authorize diagnosis update', () => { setModal('diagnosis'); setTab('overview') })}>
                  <FileText size={13} /> Diagnosis
                </Button>
                <Button size="sm" variant="secondary" onClick={() => requestKey('Authorize prescription update', () => setModal('prescription'))}>
                  <Pill size={13} /> Prescription
                </Button>
                <Button size="sm" variant="secondary" onClick={() => requestKey('Authorize forwarding to nurse', () => setModal('forward-nurse'))}>
                  Forward to Nurse
                </Button>
                <Button size="sm" variant="secondary" onClick={() => requestKey('Authorize lab order', () => setModal('forward-lab'))}>
                  <FlaskConical size={13} /> Order Lab
                </Button>
                {['OPEN','WITH_DOCTOR','WITH_NURSE','WITH_LAB'].includes(visit.status) && (
                  <Button size="sm" variant="success" onClick={() => requestKey('Authorize visit finalization', () => setModal('finalize'))}>
                    <CheckCircle size={13} /> Finalize Visit
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'clinical', label: 'Clinical' },
              { id: 'labs',     label: 'Lab Results' },
              { id: 'ehr',      label: 'Patient EHR' },
            ].map(t => (
              <button key={t.id}
                onClick={() => { setTab(t.id); if (t.id === 'ehr') fetchEHR() }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${tab === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5">
                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-medium">Clinical Notes</p>
                <div className="space-y-3">
                  <Field label="Chief Complaint" value={clinical?.chiefComplaint || '—'} />
                  <Field label="Diagnosis Notes" value={clinical?.diagnosisNotes || '—'} />
                  <Field label="Final Diagnosis" value={clinical?.finalDiagnosis || 'Not finalized'} />
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-medium">Vitals</p>
                {clinical?.vitals ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(clinical.vitals).filter(([k]) => !['recordedBy','recordedAt'].includes(k)).map(([k,v]) => (
                      <Field key={k} label={k.replace(/([A-Z])/g,' $1').trim()} value={v} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No vitals recorded yet</p>
                )}
              </Card>
            </div>
          )}

          {tab === 'clinical' && (
            <div className="space-y-4">
              {/* Prescriptions */}
              <Card className="p-5">
                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-medium">Prescriptions</p>
                {clinical?.prescriptions?.length > 0 ? (
                  <div className="space-y-3">
                    {clinical.prescriptions.map((rx, i) => (
                      <div key={i} className="border border-slate-100 rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="blue">Version {rx.version}</Badge>
                          <span className="text-xs text-slate-400">{new Date(rx.prescribedAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                        </div>
                        <ul className="space-y-1">
                          {rx.medications?.map((m, j) => (
                            <li key={j} className="text-sm text-slate-700 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />{m}
                            </li>
                          ))}
                        </ul>
                        {rx.instructions && <p className="text-xs text-slate-500 mt-2 italic">{rx.instructions}</p>}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No prescriptions yet</p>}
              </Card>

              {/* Care Notes */}
              <Card className="p-5">
                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-medium">Nurse Care Notes</p>
                {clinical?.careNotes?.length > 0 ? (
                  <div className="space-y-2">
                    {clinical.careNotes.map((n, i) => (
                      <div key={i} className="bg-violet-50 border border-violet-100 rounded-lg p-3">
                        <p className="text-sm text-slate-700">{n.note}</p>
                        <p className="text-xs text-slate-400 mt-1">{n.recordedBy} · {new Date(n.recordedAt).toLocaleString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No care notes yet</p>}
              </Card>

              {/* Forwarding Log */}
              <Card className="p-5">
                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-medium">Forwarding Log</p>
                {clinical?.forwardingLog?.length > 0 ? (
                  <div className="space-y-2">
                    {clinical.forwardingLog.map((l, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                        <div className="w-2 h-2 bg-slate-300 rounded-full mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{l.action?.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-400">{l.from} → {l.to || '—'} · {new Date(l.timestamp).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</p>
                          {l.notes && <p className="text-xs text-slate-500 mt-0.5 italic">{l.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400">No entries</p>}
              </Card>
            </div>
          )}

          {tab === 'labs' && (
            <Card className="p-5">
              <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide font-medium">Lab Requests</p>
              {clinical?.labRequests?.length > 0 ? (
                <div className="space-y-4">
                  {clinical.labRequests.map((lr, i) => (
                    <LabRequestCard key={i} lr={lr} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={FlaskConical} title="No lab requests" desc="Order lab tests from the actions above" />
              )}
            </Card>
          )}

          {tab === 'ehr' && (
            <EHRView ehr={ehr} visitId={visit?.visitId} api={api} onRefresh={refresh} accessDenied={ehrAccessDenied} onAccessGranted={() => { setEhrAccessDenied(false); fetchEHR() }} />
          )}
        </>
      )}

      {/* Modals */}
      {modal === 'diagnosis' && (
        <DiagnosisModal visit={visit} clinical={clinical} api={api}
          onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'prescription' && (
        <PrescriptionModal visit={visit} api={api}
          onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'forward-nurse' && (
        <ForwardNurseModal visit={visit} api={api}
          onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'forward-lab' && (
        <LabOrderModal visit={visit} api={api}
          onClose={() => setModal(null)} onDone={refresh} />
      )}
      {modal === 'finalize' && (
        <FinalizeModal visit={visit} clinical={clinical} api={api}
          onClose={() => setModal(null)} onDone={refresh} />
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

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800">{value || '—'}</p>
    </div>
  )
}

function LabRequestCard({ lr }) {
  const [open, setOpen] = useState(false)
  const statusColor = {
    REQUESTED:    'bg-slate-100 text-slate-600',
    ACKNOWLEDGED: 'bg-amber-100 text-amber-700',
    COMPLETED:    'bg-blue-100 text-blue-700',
    APPROVED:     'bg-emerald-100 text-emerald-700',
  }[lr.status] || 'bg-gray-100 text-gray-600'

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <FlaskConical size={15} className="text-amber-500" />
          <div>
            <p className="font-medium text-sm text-slate-900">{lr.labRequestId}</p>
            <p className="text-xs text-slate-400">{lr.tests?.join(', ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{lr.status}</span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          {lr.results && Object.keys(lr.results).length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Results</p>
              {Object.entries(lr.results).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-sm text-slate-600">{k}</span>
                  <span className="text-sm font-medium text-slate-900">{v}</span>
                </div>
              ))}
              {lr.approvedBy && (
                <p className="text-xs text-emerald-600 mt-2">Approved by {lr.approvedBy}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Results pending</p>
          )}
        </div>
      )}
    </div>
  )
}

const SECTION_FIELDS = {
  allergies: [
    { key: 'allergy',  label: 'Allergy',  placeholder: 'e.g. Penicillin, Sulfa drugs', required: true },
    { key: 'severity', label: 'Severity', type: 'select', options: ['Low', 'Moderate', 'High'] },
    { key: 'reaction', label: 'Reaction', placeholder: 'e.g. Rash, Anaphylaxis' },
  ],
  chronicConditions: [
    { key: 'condition', label: 'Condition', placeholder: 'e.g. Diabetes Type 2', required: true },
    { key: 'since',     label: 'Since',     placeholder: 'e.g. 2018' },
  ],
  ongoingMedications: [
    { key: 'medication', label: 'Medication', placeholder: 'e.g. Metformin 500mg', required: true },
    { key: 'frequency',  label: 'Frequency',  placeholder: 'e.g. BD after meals' },
  ],
  surgicalHistory: [
    { key: 'procedure', label: 'Procedure', placeholder: 'e.g. Appendectomy', required: true },
    { key: 'year',      label: 'Year',      placeholder: 'e.g. 2015' },
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

const makeEmptyEntry = (section) =>
  Object.fromEntries(SECTION_FIELDS[section].map(f => [f.key, f.type === 'select' ? f.options[0] : '']))

const normalizeEntry = (item, section) => {
  const base = makeEmptyEntry(section)
  if (typeof item === 'string') {
    base[SECTION_FIELDS[section][0].key] = item
    return base
  }
  SECTION_FIELDS[section].forEach(f => { 
    if (item[f.key] != null) base[f.key] = item[f.key]
    // Also check inside 'attributes' object for medicalHistory
    if (section === 'medicalHistory' && item.attributes && item.attributes[f.key] != null) {
      base[f.key] = item.attributes[f.key]
    }
  })
  return base
}

function EHRView({ ehr, visitId, api, onRefresh, accessDenied, onAccessGranted }) {
  const [editSection, setEditSection] = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  // ── Access Request sub-state ──────────────────────────────
  const [reqSections, setReqSections] = useState(['ehr', 'visits'])
  const [reqReason, setReqReason]     = useState('')
  const [reqStatus, setReqStatus]     = useState(null) // null | 'pending' | 'error'
  const [reqMsg, setReqMsg]           = useState('')

  const SECTION_OPTS = ['ehr', 'visits', 'prescriptions', 'labResults']

  const sendRequest = async () => {
    setLoading(true); setReqMsg('')
    try {
      await api().post(`/doctor/visits/${visitId}/request-access`, {
        sections: reqSections,
        reason: reqReason || 'Clinical consultation requires EHR access',
      })
      setReqStatus('pending')
      setReqMsg('Request sent. Waiting for patient approval.')
    } catch (err) {
      const msg = err.response?.data?.error || 'Request failed'
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('pending')) {
        setReqStatus('pending')
        setReqMsg('A request is already pending patient approval.')
      } else {
        setReqMsg(msg)
      }
    } finally { setLoading(false) }
  }

  if (accessDenied || (!ehr && accessDenied !== false)) {
    if (!accessDenied) return (
      <Card className="p-8">
        <EmptyState icon={FileText} title="No EHR loaded" desc="Click the Patient EHR tab to load" />
      </Card>
    )

    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-amber-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">EHR Access Required</p>
            <p className="text-sm text-slate-500 mt-0.5">
              You don't have permission to view this patient's health record. Send a request and the patient will be notified.
            </p>
          </div>
        </div>

        {reqStatus === 'pending' ? (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle size={16} className="text-blue-500 flex-shrink-0" />
            <p className="text-sm text-blue-700">{reqMsg || 'Access request sent — waiting for patient approval.'}</p>
          </div>
        ) : (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Request access to</p>
              <div className="flex flex-wrap gap-2">
                {SECTION_OPTS.map(s => (
                  <button key={s} type="button"
                    onClick={() => setReqSections(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${reqSections.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Reason (shown to patient)</p>
              <input value={reqReason} onChange={e => setReqReason(e.target.value)}
                placeholder="e.g. Review medical history for treatment plan"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {reqMsg && <p className="text-xs text-red-500">{reqMsg}</p>}
            <Button variant="primary" size="sm" loading={loading} onClick={sendRequest}
              disabled={reqSections.length === 0}>
              Send Access Request
            </Button>
          </div>
        )}
      </Card>
    )
  }

  if (!ehr) return (
    <Card className="p-8">
      <EmptyState icon={FileText} title="No EHR loaded" desc="Click the Patient EHR tab to load" />
    </Card>
  )

  const sections = [
    { key: 'allergies',          label: 'Allergies' },
    { key: 'chronicConditions',  label: 'Chronic Conditions' },
    { key: 'ongoingMedications', label: 'Ongoing Medications' },
    { key: 'surgicalHistory',    label: 'Surgical History' },
    { key: 'immunizations',      label: 'Immunizations' },
    { key: 'medicalHistory',     label: 'Medical History' },
  ]

  const saveSection = async (section, data) => {
    setLoading(true); setError('')
    try {
      await api().put(`/doctor/visits/${visitId}/ehr`, { section, data })
      onRefresh()
      setEditSection(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[['Name', ehr.demographics?.name], ['Age', ehr.demographics?.age], ['Gender', ehr.demographics?.gender], ['Blood Group', ehr.demographics?.bloodGroup]].map(([l, v]) => (
            <Field key={l} label={l} value={v} />
          ))}
        </div>
      </Card>

      {sections.map(({ key, label }) => (
        <Card key={key} className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</p>
            <Button size="sm" variant="ghost" onClick={() => { setError(''); setEditSection({ key, label }) }}>
              Edit
            </Button>
          </div>
          {ehr[key]?.length > 0 ? (
            <div className="space-y-1">
              {ehr[key].map((item, i) => (
                <div key={i} className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                  {key === 'medicalHistory' ? (
                    <div>
                      <p className="font-medium whitespace-pre-wrap">{item.text}</p>
                      {item.attributes && (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 py-2 border-t border-slate-100">
                          {Object.entries(item.attributes).filter(([_, v]) => v).map(([k, v]) => (
                            <div key={k} className="flex flex-col">
                              <span className="text-[10px] text-slate-400 capitalize font-medium">{k.replace(/([A-Z])/g, ' $1')}</span>
                              <span className="text-xs text-slate-600 truncate">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                        Source: {item.sourceType || 'MANUAL'} · Added: {item.addedAt ? new Date(item.addedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                  ) : (
                    typeof item === 'string' ? item : Object.entries(item).filter(([k]) => !['addedBy','addedAt','addedByRole'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(' · ')
                  )}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">None recorded</p>}
        </Card>
      ))}

      {editSection && (
        <EHREditModal
          section={editSection.key}
          label={editSection.label}
          items={ehr[editSection.key]}
          loading={loading}
          error={error}
          onClose={() => { setEditSection(null); setError('') }}
          onSave={saveSection}
        />
      )}
    </div>
  )
}

function EHREditModal({ section, label, items, loading, error, onClose, onSave }) {
  const fields = SECTION_FIELDS[section]
  const [entries, setEntries] = useState(
    items?.length > 0 ? items.map(i => normalizeEntry(i, section)) : [makeEmptyEntry(section)]
  )

  const updateEntry = (idx, key, val) =>
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [key]: val } : e))
  const addEntry    = () => setEntries(prev => [...prev, makeEmptyEntry(section)])
  const removeEntry = (idx) => setEntries(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    const cleaned = entries
      .filter(e => fields.filter(f => f.required).every(f => e[f.key]?.trim()))
      .map(e => {
        const out = {}
        fields.forEach(f => { if (e[f.key]?.trim()) out[f.key] = e[f.key].trim() })
        
        // Group attributes for medicalHistory
        if (section === 'medicalHistory') {
          const { text, sourceType, ...attrs } = out
          return { text, sourceType, attributes: attrs }
        }
        return out
      })
    onSave(section, cleaned)
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${label}`} size="lg">
      <div className="space-y-4">
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex gap-2 items-start bg-slate-50 rounded-lg p-3">
              <div className="flex-1 grid grid-cols-1 gap-2">
                {fields.map(f => (
                  <div key={f.key} className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 w-24 flex-shrink-0">{f.label}{f.required ? ' *' : ''}</label>
                    {f.type === 'select' ? (
                      <select value={entry[f.key]} onChange={e => updateEntry(idx, f.key, e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        {f.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={entry[f.key]} onChange={e => updateEntry(idx, f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors">
          <Plus size={14} /> Add entry
        </button>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  )
}

function DiagnosisModal({ visit, clinical, api, onClose, onDone }) {
  const [notes, setNotes] = useState(clinical?.diagnosisNotes || '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().put(`/doctor/visits/${visit.visitId}/diagnosis`, { notes })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Update Diagnosis Notes" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={6} required
          placeholder="Working diagnosis, observations, differential diagnoses..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="blue" loading={loading}>Save Notes</Button>
        </div>
      </form>
    </Modal>
  )
}

function PrescriptionModal({ visit, api, onClose, onDone }) {
  const [medications, setMedications] = useState([''])
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const addMed = () => setMedications(m => [...m, ''])
  const updateMed = (i, v) => setMedications(m => m.map((x, j) => j === i ? v : x))
  const removeMed = (i) => setMedications(m => m.filter((_, j) => j !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const meds = medications.filter(m => m.trim())
    if (!meds.length) { setError('Add at least one medication'); return }
    setLoading(true); setError('')
    try {
      await api().put(`/doctor/visits/${visit.visitId}/prescription`, { medications: meds, instructions })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Write Prescription" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">Medications</label>
          <div className="space-y-2">
            {medications.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input value={m} onChange={e => updateMed(i, e.target.value)}
                  placeholder="e.g. Paracetamol 500mg q6h"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {medications.length > 1 && (
                  <button type="button" onClick={() => removeMed(i)} className="text-slate-400 hover:text-red-500 transition-colors">
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addMed}
            className="mt-2 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition-colors">
            <Plus size={14} /> Add medication
          </button>
        </div>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
          placeholder="Instructions (e.g. Take after meals, plenty of fluids...)"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="blue" loading={loading}>Save Prescription</Button>
        </div>
      </form>
    </Modal>
  )
}

function ForwardNurseModal({ visit, api, onClose, onDone }) {
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().put(`/doctor/visits/${visit.visitId}/forward/nurse`, { instructions })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Forward to Nurse" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">Nurse assigned: <strong>{visit.assignedNurse || 'Not assigned'}</strong></p>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3}
          placeholder="Instructions for nurse (e.g. Record vitals, administer medication...)"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="blue" loading={loading}>Forward to Nurse</Button>
        </div>
      </form>
    </Modal>
  )
}

function LabOrderModal({ visit, api, onClose, onDone }) {
  const [tests, setTests]               = useState([''])
  const [instructions, setInstructions] = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  const addTest = () => setTests(t => [...t, ''])
  const updateTest = (i, v) => setTests(t => t.map((x, j) => j === i ? v : x))
  const removeTest = (i) => setTests(t => t.filter((_, j) => j !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validTests = tests.filter(t => t.trim())
    if (!validTests.length) { setError('Add at least one test'); return }
    setLoading(true); setError('')
    try {
      await api().put(`/doctor/visits/${visit.visitId}/forward/lab`, { tests: validTests, instructions })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  const commonTests = ['CBC', 'Blood Sugar (F)', 'Blood Sugar (PP)', 'Urine R/E', 'LFT', 'RFT', 'Dengue NS1', 'Dengue IgM/IgG', 'Chest X-Ray', 'ECG', 'TSH', 'HbA1c', 'Lipid Profile']

  return (
    <Modal open onClose={onClose} title="Order Lab Tests" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700 mb-2 block">Quick Add</label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {commonTests.map(t => (
              <button key={t} type="button"
                onClick={() => setTests(prev => prev[0] === '' ? [t] : [...prev, t])}
                className="px-2.5 py-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full hover:bg-amber-100 transition-colors">
                + {t}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {tests.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input value={t} onChange={e => updateTest(i, e.target.value)}
                  placeholder="e.g. CBC, Blood Sugar, X-Ray Chest"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
                {tests.length > 1 && (
                  <button type="button" onClick={() => removeTest(i)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addTest}
            className="mt-2 flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700"><Plus size={14} /> Add test</button>
        </div>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2}
          placeholder="Special instructions (e.g. Fasting sample, urgent...)"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" />
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={loading} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
            <FlaskConical size={14} /> Order Tests
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function FinalizeModal({ visit, clinical, api, onClose, onDone }) {
  const [finalDiagnosis, setFinalDiagnosis] = useState(clinical?.diagnosisNotes?.slice(0, 100) || '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().put(`/doctor/visits/${visit.visitId}/finalize`, { finalDiagnosis })
      onDone(); onClose()
    } catch (err) { setError(err.response?.data?.error || 'Finalization failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Finalize Visit" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Alert type="warning">Finalizing a visit locks clinical notes. The patient can be handed to pharmacy and medical records.</Alert>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Final Diagnosis *</label>
          <textarea value={finalDiagnosis} onChange={e => setFinalDiagnosis(e.target.value)} rows={3} required
            placeholder="e.g. Dengue Fever — Confirmed by NS1 Antigen and CBC"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
        </div>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="success" loading={loading}>Finalize Visit</Button>
        </div>
      </form>
    </Modal>
  )
}
