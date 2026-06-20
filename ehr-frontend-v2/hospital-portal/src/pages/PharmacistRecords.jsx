import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Alert, StatusBadge, Spinner, EmptyState, Modal, Badge } from '../components/ui'
import { Pill, Search, CheckCircle, ChevronRight, ArrowLeft } from 'lucide-react'
import KeyGateModal from '../components/security/KeyGateModal'

// ── Pharmacist Page ───────────────────────────────────────────────────────────
export function PharmacistPage() {
  const { api, userKey } = useAuth()
  const [visits, setVisits]     = useState([])
  const [search, setSearch]     = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [visit, setVisit]       = useState(null)
  const [clinical, setClinical] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(false)
  const [success, setSuccess]   = useState('')
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
      const res = await api().get('/pharmacist/visits')
      setVisits(res.data.data || [])
    } catch {} finally { setListLoading(false) }
  }

  const fetchVisit = async (id) => {
    if (!id?.trim()) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const res = await api().get(`/pharmacist/visits/${id.trim()}`)
      setVisit(res.data.data)
      setClinical(res.data.data.clinical || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Visit not found')
      setVisit(null)
    } finally { setLoading(false) }
  }

  const canDispense = visit?.status === 'VISIT_FINALIZED'

  const filtered = visits.filter(v =>
    v.visitId.toLowerCase().includes(search.toLowerCase()) ||
    v.patientId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Pharmacy</h1>
          <p className="text-sm text-slate-500 mt-0.5">Verify prescription and dispense medication</p>
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
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
          </Card>

          {listLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.length === 0 ? (
                <div className="col-span-2">
                  <Card className="p-12"><EmptyState icon={Pill} title="No visits ready" desc={search ? 'Try a different search term' : 'Finalized visits will appear here for dispensing'} /></Card>
                </div>
              ) : filtered.map(v => (
                <Card key={v.visitId}
                  className="p-4 cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => fetchVisit(v.visitId)}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 font-mono text-sm truncate">{v.visitId}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Patient: {v.patientId}</p>
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

      {error   && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {loading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {visit && !loading && (
        <div className="space-y-4">
          <button onClick={() => { setVisit(null); setClinical(null); setError(''); setSuccess('') }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft size={15} /> All Visits
          </button>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-slate-400">{visit.visitId}</p>
                <h2 className="text-lg font-semibold text-slate-900">Patient: {visit.patientId}</h2>
                <StatusBadge status={visit.status} />
              </div>
              {canDispense && (
                <Button className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  onClick={() => requestKey('Authorize medication dispense', () => setModal(true))}>
                  <Pill size={14} /> Dispense Medication
                </Button>
              )}
              {['OPEN','WITH_DOCTOR','WITH_NURSE','WITH_LAB'].includes(visit.status) ? (
                <Alert type="info">Visit is still active. Dispensing is available after doctor finalizes the visit.</Alert>
              ) : null}
            </div>
          </Card>

          {/* Current Prescription */}
          <Card className="p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">Prescription to Dispense</p>
            {clinical?.prescriptions?.length > 0 ? (
              (() => {
                const latest = clinical.prescriptions[clinical.prescriptions.length - 1]
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="blue">Version {latest.version}</Badge>
                      <span className="text-xs text-slate-400">by {latest.prescribedBy}</span>
                    </div>
                    <div className="space-y-2">
                      {latest.medications?.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5">
                          <Pill size={14} className="text-teal-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-800">{m}</span>
                        </div>
                      ))}
                    </div>
                    {latest.instructions && (
                      <p className="mt-3 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2 italic">{latest.instructions}</p>
                    )}
                  </div>
                )
              })()
            ) : (
              <p className="text-sm text-slate-400">No prescription on file</p>
            )}
          </Card>

          {/* Dispense history */}
          {clinical?.medicationDetails && (
            <Card className="p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">Dispensed</p>
              <p className="text-sm text-slate-700">{clinical.medicationDetails}</p>
              <p className="text-xs text-slate-400 mt-1">
                by {clinical.medicationDispensedBy} · {clinical.medicationDispensedAt && new Date(clinical.medicationDispensedAt).toLocaleString('en-IN')}
              </p>
            </Card>
          )}
        </div>
      )}

      {modal && (
        <DispenseModal visit={visit} clinical={clinical} api={api}
          onClose={() => setModal(false)}
          onDone={() => { setSuccess('Medication dispensed successfully'); fetchVisit(visit.visitId); setModal(false) }} />
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

function DispenseModal({ visit, clinical, api, onClose, onDone }) {
  const latest = clinical?.prescriptions?.[clinical.prescriptions.length - 1]
  const [details, setDetails] = useState(latest?.medications?.join(', ') + ' as prescribed' || '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      await api().put(`/pharmacist/visits/${visit.visitId}/dispense`, { medicationDetails: details })
      onDone()
    } catch (err) { setError(err.response?.data?.error || 'Dispense failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal open onClose={onClose} title="Confirm Medication Dispense" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Alert type="info">This records the medications as dispensed on the blockchain.</Alert>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Dispense Details</label>
          <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none" />
        </div>
        {error && <Alert type="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors" loading={loading}>
            Confirm Dispense
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Medical Records Page ──────────────────────────────────────────────────────
export function MedRecordsPage() {
  const { api, userKey } = useAuth()
  const [visits, setVisits]     = useState([])
  const [search, setSearch]     = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [visit, setVisit]       = useState(null)
  const [clinical, setClinical] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(false)
  const [success, setSuccess]   = useState('')
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
      const res = await api().get('/records/visits')
      setVisits(res.data.data || [])
    } catch {} finally { setListLoading(false) }
  }

  const fetchVisit = async (id) => {
    if (!id?.trim()) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const res = await api().get(`/records/visits/${id.trim()}`)
      setVisit(res.data.data)
      setClinical(res.data.data.clinical || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Visit not found')
      setVisit(null)
    } finally { setLoading(false) }
  }

  const canFinalize = visit?.status === 'VISIT_FINALIZED'

  const filtered = visits.filter(v =>
    v.visitId.toLowerCase().includes(search.toLowerCase()) ||
    v.patientId.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Medical Records</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review and finalize official patient records</p>
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
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </Card>

          {listLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.length === 0 ? (
                <div className="col-span-2">
                  <Card className="p-12"><EmptyState icon={CheckCircle} title="No visits to finalize" desc={search ? 'Try a different search term' : 'Visits ready for record finalization will appear here'} /></Card>
                </div>
              ) : filtered.map(v => (
                <Card key={v.visitId}
                  className="p-4 cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => fetchVisit(v.visitId)}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 font-mono text-sm truncate">{v.visitId}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Patient: {v.patientId}</p>
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

      {error   && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}
      {loading && <div className="flex justify-center py-12"><Spinner size="lg" /></div>}

      {visit && !loading && (
        <div className="space-y-4">
          <button onClick={() => { setVisit(null); setClinical(null); setError(''); setSuccess('') }}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ArrowLeft size={15} /> All Visits
          </button>

          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs text-slate-400">{visit.visitId}</p>
                <h2 className="text-lg font-semibold text-slate-900">Patient: {visit.patientId}</h2>
                <StatusBadge status={visit.status} />
              </div>
              {canFinalize && (
                <Button className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  onClick={() => requestKey('Authorize record finalization', () => setModal(true))}>
                  <CheckCircle size={14} /> Finalize Record
                </Button>
              )}
            </div>
          </Card>

          {/* Full Record Summary */}
          <Card className="p-5 space-y-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Complete Visit Record</p>
            {[
              ['Chief Complaint', clinical?.chiefComplaint],
              ['Diagnosis Notes', clinical?.diagnosisNotes],
              ['Final Diagnosis', clinical?.finalDiagnosis],
              ['Attending Doctor', visit.assignedDoctor],
              ['Attending Nurse',  visit.assignedNurse],
            ].map(([l, v]) => v ? (
              <div key={l} className="border-b border-slate-50 pb-3 last:border-0">
                <p className="text-xs text-slate-400 mb-1">{l}</p>
                <p className="text-sm text-slate-800">{v}</p>
              </div>
            ) : null)}

            {clinical?.prescriptions?.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Final Prescription</p>
                {(() => {
                  const latest = clinical.prescriptions[clinical.prescriptions.length - 1]
                  return (
                    <ul className="space-y-1">
                      {latest.medications?.map((m, i) => (
                        <li key={i} className="text-sm text-slate-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />{m}
                        </li>
                      ))}
                    </ul>
                  )
                })()}
              </div>
            )}

            {clinical?.vitals && (
              <div>
                <p className="text-xs text-slate-400 mb-2">Final Vitals</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(clinical.vitals).filter(([k]) => !['recordedBy','recordedAt'].includes(k)).map(([k, v]) => (
                    <div key={k} className="bg-slate-50 rounded p-2">
                      <p className="text-xs text-slate-400">{k}</p>
                      <p className="text-sm font-medium text-slate-700">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {clinical?.recordFinalizedBy && (
              <Alert type="success">Finalized by {clinical.recordFinalizedBy} on {new Date(clinical.recordFinalizedAt).toLocaleString('en-IN')}</Alert>
            )}
          </Card>
        </div>
      )}

      {modal && (
        <Modal open onClose={() => setModal(false)} title="Finalize Medical Record" size="sm">
          <div className="space-y-4">
            <Alert type="warning">
              Finalizing the record marks it as RECORD_FINALIZED. The billing team can then submit an insurance claim.
            </Alert>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
              <Button className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                onClick={async () => {
                  try {
                    await api().put(`/records/visits/${visit.visitId}/finalize`)
                    setSuccess('Record finalized successfully')
                    fetchVisit(visit.visitId)
                    setModal(false)
                  } catch (err) { setError(err.response?.data?.error || 'Failed') }
                }}>
                Confirm &amp; Finalize
              </Button>
            </div>
          </div>
        </Modal>
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
