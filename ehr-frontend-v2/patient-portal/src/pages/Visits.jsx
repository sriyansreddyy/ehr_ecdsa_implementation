import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Spinner, VisitStatusBadge, SectionTitle, Alert } from '../components/ui'
import { formatDate, formatDateTime } from '../utils/api'
import {
  Calendar, ChevronRight, FlaskConical, Pill, Activity, FileText,
  ChevronDown, ChevronUp, ArrowLeft,
  CheckCircle2, Circle, Clock, User, Stethoscope, ClipboardCheck,
  TestTubes, ShieldCheck, LogOut, DoorOpen, UserCheck, Loader,
} from 'lucide-react'

// ── Visit status order ────────────────────────────────────────
const STATUS_ORDER = [
  'OPEN',
  'WITH_DOCTOR',
  'WITH_NURSE',
  'WITH_LAB',
  'VISIT_FINALIZED',
  'RECORD_FINALIZED',
  'CLAIM_SUBMITTED',
  'CLAIM_UNDER_AUDIT',
  'CLAIM_APPROVED',
  'DISCHARGED',
]

// Human-readable label + icon for each stage
const STAGE_META = {
  OPEN:              { label: 'Visit Opened',           icon: DoorOpen,      color: 'text-slate-500',   bg: 'bg-slate-100'  },
  WITH_DOCTOR:       { label: 'Doctor Consultation',    icon: Stethoscope,   color: 'text-blue-600',    bg: 'bg-blue-50'    },
  WITH_NURSE:        { label: 'Nursing Care',           icon: UserCheck,     color: 'text-violet-600',  bg: 'bg-violet-50'  },
  WITH_LAB:          { label: 'Lab Tests',              icon: TestTubes,     color: 'text-amber-600',   bg: 'bg-amber-50'   },
  VISIT_FINALIZED:   { label: 'Visit Finalized',        icon: ClipboardCheck,color: 'text-emerald-600', bg: 'bg-emerald-50' },
  RECORD_FINALIZED:  { label: 'Medical Record Approved',icon: FileText,      color: 'text-teal-600',    bg: 'bg-teal-50'    },
  CLAIM_SUBMITTED:   { label: 'Insurance Claim Filed',  icon: ShieldCheck,   color: 'text-indigo-600',  bg: 'bg-indigo-50'  },
  CLAIM_UNDER_AUDIT: { label: 'Claim Under Review',     icon: Loader,        color: 'text-orange-600',  bg: 'bg-orange-50'  },
  CLAIM_APPROVED:    { label: 'Claim Approved',         icon: ShieldCheck,   color: 'text-green-600',   bg: 'bg-green-50'   },
  CLAIM_REJECTED:    { label: 'Claim Rejected',         icon: ShieldCheck,   color: 'text-red-600',     bg: 'bg-red-50'     },
  DISCHARGED:        { label: 'Discharged',             icon: LogOut,        color: 'text-slate-600',   bg: 'bg-slate-100'  },
}

// forwardingLog action → readable description
const ACTION_LABEL = {
  VISIT_OPENED:         'Visit opened at reception',
  DOCTOR_ASSIGNED:      'Referred to doctor',
  NURSE_ASSIGNED:       'Referred to nursing care',
  FORWARDED_TO_NURSE:   'Referred to nursing care',
  FORWARDED_TO_DOCTOR:  'Referred back to doctor',
  FORWARDED_TO_LAB:     'Lab tests ordered',
  LAB_RESULTS_READY:    'Lab results ready for doctor',
  LAB_RESULTS_BACK_TO_DOCTOR: 'Lab results ready for doctor',
  VISIT_FINALIZED:      'Doctor finalized the visit',
  RECORD_FINALIZED:     'Medical record approved',
  MEDICATION_DISPENSED: 'Medications dispensed',
  PATIENT_DISCHARGED:   'Patient discharged',
  CLAIM_SUBMITTED:      'Insurance claim submitted',
  CLAIM_AUDITED:        'Claim sent for audit',
  CLAIM_PROCESSED:      'Claim decision made',
}

const ROLE_LABEL = {
  receptionist:     'Reception',
  doctor:           'Doctor',
  nurse:            'Nurse',
  labTechnician:    'Lab',
  labtech:          'Lab',
  medrecordofficer: 'Medical Records',
  pharmacist:       'Pharmacy',
  admin:            'Administration',
  billing:          'Billing',
  patientService:   'System',
}

// Which statuses come next for a given current status
const UPCOMING_STEPS = {
  OPEN:              ['WITH_DOCTOR'],
  WITH_DOCTOR:       ['WITH_NURSE', 'WITH_LAB', 'VISIT_FINALIZED'],
  WITH_NURSE:        ['WITH_DOCTOR', 'VISIT_FINALIZED'],
  WITH_LAB:          ['WITH_DOCTOR', 'VISIT_FINALIZED'],
  VISIT_FINALIZED:   ['RECORD_FINALIZED'],
  RECORD_FINALIZED:  ['CLAIM_SUBMITTED'],
  CLAIM_SUBMITTED:   ['CLAIM_UNDER_AUDIT', 'CLAIM_APPROVED'],
  CLAIM_UNDER_AUDIT: ['CLAIM_APPROVED', 'CLAIM_REJECTED'],
  CLAIM_APPROVED:    ['DISCHARGED'],
  CLAIM_REJECTED:    ['DISCHARGED'],
  DISCHARGED:        [],
}

// ── Timeline component ────────────────────────────────────────
function VisitFlowTimeline({ visit, forwardingLog = [] }) {
  const currentStatus = visit.status
  const isDone = currentStatus === 'DISCHARGED'

  // Build the list of completed events from forwardingLog
  const completedEvents = forwardingLog.map(entry => ({
    action:    entry.action,
    label:     ACTION_LABEL[entry.action] || entry.action?.replace(/_/g, ' ')?.toLowerCase()
                 ?.replace(/^\w/, c => c.toUpperCase()),
    fromRole:  ROLE_LABEL[entry.fromRole] || entry.fromRole,
    toRole:    ROLE_LABEL[entry.toRole]   || entry.toRole   || null,
    notes:     entry.notes,
    timestamp: entry.timestamp,
  }))

  // Upcoming steps (deduplicated, skip already-seen statuses)
  const upcomingStatuses = (UPCOMING_STEPS[currentStatus] || [])
    .filter(s => s !== currentStatus)

  const meta = STAGE_META[currentStatus] || { label: currentStatus, icon: Circle, color: 'text-slate-500', bg: 'bg-slate-100' }

  return (
    <Card className="p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Visit Journey</p>

      <div className="relative">
        {/* Vertical connecting line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

        <div className="space-y-0">

          {/* ── Completed events ─────────────────────────── */}
          {completedEvents.map((ev, i) => (
            <div key={i} className="relative flex gap-4 pb-5">
              {/* Dot */}
              <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-emerald-500" />
              </div>
              {/* Content */}
              <div className="flex-1 pt-0.5 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{ev.label}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-slate-400">
                    {ev.fromRole}{ev.toRole && ev.toRole !== ev.fromRole ? ` → ${ev.toRole}` : ''}
                  </span>
                  {ev.timestamp && (
                    <span className="text-xs text-slate-300">·</span>
                  )}
                  {ev.timestamp && (
                    <span className="text-xs text-slate-400">{formatDateTime(ev.timestamp)}</span>
                  )}
                </div>
                {ev.notes && (
                  <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 rounded-lg px-3 py-2 italic">
                    "{ev.notes}"
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* ── Current status ───────────────────────────── */}
          {!isDone && (
            <div className="relative flex gap-4 pb-5">
              <div className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full ${meta.bg} flex items-center justify-center ring-2 ring-offset-2 ring-blue-400`}>
                <meta.icon size={15} className={meta.color} />
              </div>
              <div className="flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">{meta.label}</p>
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    Now
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Your visit is currently at this stage</p>
              </div>
            </div>
          )}

          {/* Discharged final state */}
          {isDone && (
            <div className="relative flex gap-4 pb-1">
              <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-slate-500" />
              </div>
              <div className="flex-1 pt-0.5">
                <p className="text-sm font-semibold text-slate-700">Discharged</p>
                {visit.dischargedBy && (
                  <p className="text-xs text-slate-400 mt-0.5">By {ROLE_LABEL[visit.dischargedBy] || visit.dischargedBy}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Upcoming steps ───────────────────────────── */}
          {!isDone && upcomingStatuses.length > 0 && upcomingStatuses.map((s, i) => {
            const m = STAGE_META[s] || { label: s, icon: Circle, color: 'text-slate-300', bg: 'bg-slate-50' }
            const Icon = m.icon
            const isLast = i === upcomingStatuses.length - 1
            return (
              <div key={s} className={`relative flex gap-4 ${isLast ? 'pb-0' : 'pb-5'}`}>
                <div className="relative z-10 flex-shrink-0 w-8 h-8 rounded-full bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center">
                  <Icon size={14} className="text-slate-300" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-slate-300 font-medium">{m.label}</p>
                </div>
              </div>
            )
          })}

        </div>
      </div>
    </Card>
  )
}

// ── Visits list page ──────────────────────────────────────────
export function VisitsListPage() {
  const { api } = useAuth()
  const navigate = useNavigate()
  const [visits, setVisits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api().get('/visits')
      .then(r => setVisits(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <SectionTitle>My Visits</SectionTitle>

      {visits.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No visits yet</p>
          <p className="text-sm text-slate-400 mt-1">Your hospital visits will appear here</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...visits].reverse().map(v => (
            <Card key={v.visitId} onClick={() => navigate(`/visits/${v.visitId}`)} className="p-5 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <VisitStatusBadge status={v.status} />
                  </div>
                  <p className="font-mono text-xs text-slate-400 mt-1">{v.visitId}</p>
                  <p className="text-sm font-semibold text-slate-800 mt-1">{formatDate(v.createdAt)}</p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {v.assignedDoctor && (
                      <span className="text-xs text-slate-500">Dr. <span className="font-medium text-slate-700">{v.assignedDoctor}</span></span>
                    )}
                    {v.claimId && (
                      <span className="text-xs text-slate-500">Claim: <span className={`font-medium ${v.claimStatus === 'APPROVED' ? 'text-green-600' : v.claimStatus === 'REJECTED' ? 'text-red-600' : 'text-slate-700'}`}>₹{v.claimAmount?.toLocaleString()}</span></span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 mt-1 flex-shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Visit detail page ─────────────────────────────────────────
export function VisitDetailPage() {
  const { id } = useParams()
  const { api } = useAuth()
  const navigate = useNavigate()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    api().get(`/visits/${id}`)
      .then(r => setData(r.data.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load visit'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (error)   return <Alert type="error">{error}</Alert>
  if (!data)   return null

  const clinical = data.clinical || {}

  return (
    <div className="space-y-4">
      {/* Back */}
      <button onClick={() => navigate('/visits')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft size={15} /> All Visits
      </button>

      {/* Header */}
      <Card className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <VisitStatusBadge status={data.status} />
            <p className="font-mono text-xs text-slate-400 mt-2">{data.visitId}</p>
          </div>
          {data.claimAmount > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-400">Claim Amount</p>
              <p className="text-lg font-bold text-slate-900">₹{data.claimAmount?.toLocaleString()}</p>
              <p className={`text-xs font-medium ${data.claimStatus === 'APPROVED' ? 'text-green-600' : data.claimStatus === 'REJECTED' ? 'text-red-600' : 'text-slate-500'}`}>
                {data.claimStatus || '—'}
              </p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <MiniInfo label="Date"   value={formatDate(data.createdAt)} />
          <MiniInfo label="Doctor" value={data.assignedDoctor || '—'} />
          <MiniInfo label="Nurse"  value={data.assignedNurse  || '—'} />
          <MiniInfo label="Visit"  value={`#${data.visitNumber}`} />
        </div>
      </Card>

      {/* ── Visit Flow Timeline ───────────────────────── */}
      <VisitFlowTimeline
        visit={data}
        forwardingLog={clinical.forwardingLog || []}
      />

      {/* Chief Complaint */}
      {clinical.chiefComplaint && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Why You Visited</p>
          <p className="text-slate-800">{clinical.chiefComplaint}</p>
        </Card>
      )}

      {/* Diagnosis */}
      {(clinical.diagnosisNotes || clinical.finalDiagnosis) && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Diagnosis</p>
          {clinical.finalDiagnosis && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-3">
              <p className="text-xs text-emerald-600 font-semibold mb-1">Final Diagnosis</p>
              <p className="text-slate-800 font-medium">{clinical.finalDiagnosis}</p>
            </div>
          )}
          {clinical.diagnosisNotes && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Doctor's Notes</p>
              <p className="text-sm text-slate-700">{clinical.diagnosisNotes}</p>
            </div>
          )}
        </Card>
      )}

      {/* Vitals */}
      {clinical.vitals && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Vitals</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['BP',      clinical.vitals.bloodPressure],
              ['Temp',    clinical.vitals.temperature],
              ['Pulse',   clinical.vitals.pulse],
              ['Weight',  clinical.vitals.weight],
              ['Height',  clinical.vitals.height],
              ['SpO₂',    clinical.vitals.oxygenSat],
            ].filter(([, v]) => v).map(([l, v]) => (
              <div key={l} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400">{l}</p>
                <p className="text-sm font-bold text-slate-800 mt-1">{v}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Prescription */}
      {clinical.prescriptions?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Pill size={15} className="text-blue-500" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Prescription</p>
          </div>
          {(() => {
            const latest = clinical.prescriptions[clinical.prescriptions.length - 1]
            return (
              <div>
                <div className="space-y-2">
                  {latest.medications?.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-2.5">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />
                      <span className="text-sm text-slate-800">{m}</span>
                    </div>
                  ))}
                </div>
                {latest.instructions && (
                  <p className="text-xs text-slate-500 mt-3 italic">{latest.instructions}</p>
                )}
              </div>
            )
          })()}
        </Card>
      )}

      {/* Lab Results */}
      {clinical.labRequests?.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={15} className="text-amber-500" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Lab Results</p>
          </div>
          <div className="space-y-3">
            {clinical.labRequests.map((lr, i) => (
              <LabResultCard key={i} lr={lr} />
            ))}
          </div>
        </Card>
      )}

      {/* Care Notes */}
      {clinical.careNotes?.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Nurse Notes</p>
          <div className="space-y-2">
            {clinical.careNotes.map((n, i) => (
              <div key={i} className="bg-violet-50 rounded-xl px-4 py-3">
                <p className="text-sm text-slate-700">{n.note}</p>
                <p className="text-xs text-slate-400 mt-1">{formatDateTime(n.recordedAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Discharge */}
      {clinical.dischargeNotes && (
        <Card className="p-5 bg-slate-50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Discharge Notes</p>
          <p className="text-sm text-slate-700">{clinical.dischargeNotes}</p>
        </Card>
      )}

      {/* IPFS CID */}
      {data.visitCID && (
        <Card className="p-4">
          <p className="text-xs text-slate-400 mb-1">IPFS Content Address</p>
          <p className="font-mono text-xs text-teal-700 bg-teal-50 px-3 py-2 rounded-lg break-all">{data.visitCID}</p>
          <p className="text-xs text-slate-400 mt-1">{data.cidHistory?.length || 1} version{data.cidHistory?.length !== 1 ? 's' : ''} on-chain</p>
        </Card>
      )}
    </div>
  )
}

// ── Helper components ─────────────────────────────────────────
function MiniInfo({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5">{value}</p>
    </div>
  )
}

function LabResultCard({ lr }) {
  const [open, setOpen] = useState(lr.status === 'APPROVED')
  const statusColor = {
    REQUESTED:    'text-slate-500',
    ACKNOWLEDGED: 'text-amber-600',
    COMPLETED:    'text-blue-600',
    APPROVED:     'text-green-600',
  }[lr.status] || 'text-gray-500'

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors">
        <div>
          <p className="text-sm font-semibold text-slate-800">{lr.tests?.join(', ')}</p>
          <p className={`text-xs font-medium mt-0.5 ${statusColor}`}>{lr.status}</p>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {open && lr.results && Object.keys(lr.results).length > 0 && (
        <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50">
          {Object.entries(lr.results).map(([k, v]) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-xs text-slate-500">{k}</span>
              <span className="text-sm font-semibold text-slate-800">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
