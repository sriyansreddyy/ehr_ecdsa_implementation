import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Spinner, SectionTitle, Modal, Button, Alert, Input } from '../components/ui'
import { formatDate, formatDateTime } from '../utils/api'
import { FileText, AlertCircle, Heart, Activity, Syringe, Edit, ChevronRight, Shield, Plus, X, CheckCircle, Clock, ClipboardList, Fingerprint, Copy, CheckCircle2, RefreshCw, Calendar, Download, UploadCloud, Microscope } from 'lucide-react'
import { generateEhrPdf } from '../utils/pdfGenerator'

// ── EHR Page ──────────────────────────────────────────────────────────────────
export function EHRPage() {
  const { api, user } = useAuth()
  const [ehr, setEhr]     = useState(null)
  const [cid, setCid]     = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab]     = useState('summary')
  const [editModal, setEditModal] = useState(false)
  const [editForm, setEditForm]   = useState({ emergencyContact: {}, contact: '', address: '' })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [ocrModal, setOcrModal]   = useState(false)
  const [ocrFile, setOcrFile]     = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)

  const load = async () => {
    try {
      const [ehrRes, histRes] = await Promise.allSettled([
        api().get('/ehr'),
        api().get('/ehr/history'),
      ])
      if (ehrRes.status === 'fulfilled') {
        setEhr(ehrRes.value.data.data.ehr)
        setCid(ehrRes.value.data.data.cid)
      }
      if (histRes.status === 'fulfilled') setHistory(histRes.value.data.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openEdit = () => {
    setEditForm({
      emergencyContact: ehr?.emergencyContact || {},
      contact: ehr?.demographics?.contact || '',
      address: ehr?.demographics?.address || '',
    })
    setEditModal(true)
  }

  const saveContact = async () => {
    setSaving(true); setError('')
    try {
      await api().put('/ehr/contact', editForm)
      setSuccess('Contact updated successfully')
      setEditModal(false)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Update failed') }
    finally { setSaving(false) }
  }

  const handleOcrUpload = async () => {
    if (!ocrFile) return
    setOcrLoading(true); setError('')
    const formData = new FormData()
    formData.append('file', ocrFile)
    try {
      const res = await api().post('/ocr', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setOcrResult(res.data.data)
    } catch (err) { setError(err.response?.data?.error || 'OCR failed') }
    finally { setOcrLoading(false) }
  }

  const saveOcrResult = async () => {
    if (!ocrResult) return
    setSaving(true); setError('')
    try {
      await api().post('/ehr/medical-history', {
        text: ocrResult.text,
        attributes: ocrResult.attributes,
        sourceType: 'ocr',
        sourceCid: ocrResult.sourceCid
      })
      setSuccess('Medical history updated from OCR with structured details')
      setOcrModal(false); setOcrFile(null); setOcrResult(null)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const tabs = [
    { id: 'summary',  label: 'Summary' },
    { id: 'history',  label: 'EHR History' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle>My Health Record</SectionTitle>
        <div className="flex items-center gap-3">
          <button onClick={() => generateEhrPdf(ehr, user?.username || 'PAT-001')}
            className="flex items-center gap-1.5 text-sm text-slate-600 font-semibold hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl transition-colors shadow-sm">
            <Download size={14} /> Download PDF
          </button>
          <button onClick={openEdit}
            className="flex items-center gap-1.5 text-sm text-teal-600 font-semibold hover:text-teal-700">
            <Edit size={14} /> Edit Contact
          </button>
        </div>
      </div>

      {success && <Alert type="success">{success}</Alert>}

      {/* IPFS Badge */}
      {cid && (
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5">
          <Shield size={14} className="text-teal-600 flex-shrink-0" />
          <p className="text-xs text-teal-700 font-mono truncate">{cid}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${tab === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && ehr && (
        <div className="space-y-4">
          {/* Demographics */}
          <Card className="p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Personal Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Name',        ehr.demographics?.name],
                ['Age',         ehr.demographics?.age],
                ['Gender',      ehr.demographics?.gender],
                ['Blood Group', ehr.demographics?.bloodGroup],
                ['Contact',     ehr.demographics?.contact],
                ['DOB',         ehr.demographics?.dob || '—'],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-slate-400">{l}</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{v || '—'}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Emergency Contact */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Emergency Contact</p>
              <button onClick={openEdit} className="text-xs text-teal-600 font-semibold"><Edit size={12} /></button>
            </div>
            {ehr.emergencyContact?.name ? (
              <div className="grid grid-cols-2 gap-3">
                {[['Name', ehr.emergencyContact.name], ['Relation', ehr.emergencyContact.relation], ['Phone', ehr.emergencyContact.phone]].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs text-slate-400">{l}</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">{v || '—'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-sm text-slate-400">No emergency contact set</p>
                <button onClick={openEdit} className="text-xs text-teal-600 font-semibold mt-1">Add now →</button>
              </div>
            )}
          </Card>

          {/* Allergies */}
          <EHRSection icon={AlertCircle} title="Allergies" color="text-red-500" items={ehr.allergies}
            renderItem={a => typeof a === 'string' ? a : `${a.substance} — ${a.reaction} (${a.severity})`}
            emptyMsg="No known allergies" />

          {/* Chronic Conditions */}
          <EHRSection icon={Heart} title="Chronic Conditions" color="text-amber-500" items={ehr.chronicConditions}
            renderItem={c => typeof c === 'string' ? c : `${c.condition} (${c.status || 'Active'})`}
            emptyMsg="None recorded" />

          {/* Ongoing Medications */}
          <EHRSection icon={Activity} title="Ongoing Medications" color="text-blue-500" items={ehr.ongoingMedications}
            renderItem={m => typeof m === 'string' ? m : `${m.name} ${m.dose || ''} — ${m.frequency || ''}`}
            emptyMsg="None recorded" />

          {/* Immunizations */}
          <EHRSection icon={Syringe} title="Immunizations" color="text-teal-500" items={ehr.immunizations}
            renderItem={i => typeof i === 'string' ? i : `${i.vaccine} (${formatDate(i.date)})`}
            emptyMsg="None recorded" />

          {/* Medical History Section */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-5 bg-white border-b border-slate-50">
              <div className="flex items-center gap-2.5">
                <ClipboardList size={16} className="text-slate-600" />
                <span className="font-semibold text-slate-800 text-sm">Medical History</span>
                {ehr.medicalHistory?.length > 0 && (
                  <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">{ehr.medicalHistory.length}</span>
                )}
              </div>
              <button onClick={() => setOcrModal(true)} className="flex items-center gap-1.5 text-xs text-teal-600 font-bold hover:bg-teal-50 px-2 py-1.5 rounded-lg transition-colors">
                <UploadCloud size={14} /> OCR Import
              </button>
            </div>
            <div className="p-5">
              {ehr.medicalHistory?.length > 0 ? (
                <div className="space-y-4">
                  {ehr.medicalHistory.map((item, i) => (
                    <div key={i} className="relative bg-slate-50 rounded-2xl p-4 border border-slate-100 group">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Entry #{ehr.medicalHistory.length - i}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(item.addedAt)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{item.text}</p>
                      {item.attributes && (
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                          {Object.entries(item.attributes).filter(([_, v]) => v).map(([k, v]) => (
                            <div key={k}>
                              <p className="text-[10px] text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                              <p className="text-xs font-semibold text-slate-700">{v}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.sourceType === 'ocr' && (
                        <div className="mt-3 flex items-center gap-1.5">
                          <CheckCircle2 size={12} className="text-teal-500" />
                          <span className="text-[10px] text-teal-600 font-bold">Verified OCR Import</span>
                          {item.sourceCid && (
                            <span className="text-[10px] text-slate-400 ml-auto font-mono">Source: {item.sourceCid.slice(0, 8)}...</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ClipboardList size={20} className="text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">No medical history recorded yet.</p>
                  <p className="text-xs text-slate-400 mt-1">Upload reports using OCR to extract records automatically.</p>
                </div>
              )}
            </div>
          </Card>

          {/* Lifestyle */}
          {ehr.lifestyle && Object.values(ehr.lifestyle).some(v => v) && (
            <Card className="p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Lifestyle</p>
              <div className="grid grid-cols-2 gap-3">
                {[['Smoking', ehr.lifestyle.smoking], ['Alcohol', ehr.lifestyle.alcohol], ['Exercise', ehr.lifestyle.exercise], ['Diet', ehr.lifestyle.diet]].filter(([, v]) => v).map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs text-slate-400">{l}</p>
                    <p className="text-sm font-medium text-slate-700 mt-0.5 capitalize">{v}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === 'history' && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">{history.length} version{history.length !== 1 ? 's' : ''} on-chain</p>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {[...history].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                <div className="w-2 h-2 bg-teal-400 rounded-full mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-slate-600 truncate">{h.cid}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="font-medium text-slate-600">{h.section || 'update'}</span>
                    {h.reason && ` · ${h.reason}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{h.updatedBy} · {formatDateTime(h.updatedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Update Contact Info" size="sm">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Emergency Contact</p>
            <div className="space-y-3">
              {[['name','Name'], ['relation','Relationship'], ['phone','Phone']].map(([k, l]) => (
                <Input key={k} label={l}
                  value={editForm.emergencyContact[k] || ''}
                  onChange={e => setEditForm(f => ({ ...f, emergencyContact: { ...f.emergencyContact, [k]: e.target.value } }))} />
              ))}
            </div>
          </div>
          <Input label="Contact Number" value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))} />
          {error && <Alert type="error">{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button variant="teal" size="sm" loading={saving} onClick={saveContact}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* OCR Import Modal */}
      <Modal open={ocrModal} onClose={() => { setOcrModal(false); setOcrFile(null); setOcrResult(null) }} title="Medical Doc OCR Import" size="md">
        {!ocrResult ? (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center hover:border-teal-300 transition-colors bg-slate-50">
              <input type="file" id="ocr-upload" hidden accept="image/*,application/pdf"
                onChange={e => setOcrFile(e.target.files[0])} />
              <label htmlFor="ocr-upload" className="cursor-pointer">
                <UploadCloud size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">{ocrFile ? ocrFile.name : 'Select Medical Document'}</p>
                <p className="text-xs text-slate-400 mt-1">Images of prescriptions, lab reports, or discharge summaries</p>
              </label>
            </div>
            {error && <Alert type="error">{error}</Alert>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={() => { setOcrModal(false); setOcrFile(null) }}>Cancel</Button>
              <Button variant="teal" size="sm" loading={ocrLoading} disabled={!ocrFile} onClick={handleOcrUpload}>Start OCR Process</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 flex items-center gap-2">
              <Microscope size={18} className="text-teal-600" />
              <p className="text-xs text-teal-800 font-medium">Text successfully extracted. Please review and edit if necessary.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {Object.keys(ocrResult.attributes).map(key => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">{key.replace(/([A-Z])/g, ' $1')}</label>
                  <input 
                    value={ocrResult.attributes[key]}
                    onChange={e => setOcrResult({ 
                      ...ocrResult, 
                      attributes: { ...ocrResult.attributes, [key]: e.target.value } 
                    })}
                    placeholder={`no ${key} detected`}
                    className="w-full px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Raw Extracted Text</label>
              <textarea 
                value={ocrResult.text}
                onChange={e => setOcrResult({ ...ocrResult, text: e.target.value })}
                className="w-full h-32 p-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none font-mono"
              />
            </div>
            {error && <Alert type="error">{error}</Alert>}
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-400 font-mono">Source CID: {ocrResult.sourceCid?.slice(0, 10)}...</span>
              <div className="flex gap-3">
                <Button variant="secondary" size="sm" onClick={() => setOcrResult(null)}>Try Another</Button>
                <Button variant="teal" size="sm" loading={saving} onClick={saveOcrResult}>Save to History</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function EHRSection({ icon: Icon, title, color, items, renderItem, emptyMsg }) {
  const [open, setOpen] = useState(items?.length > 0)
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2.5">
          <Icon size={16} className={color} />
          <span className="font-semibold text-slate-800 text-sm">{title}</span>
          {items?.length > 0 && (
            <span className="bg-slate-100 text-slate-500 text-xs font-medium px-2 py-0.5 rounded-full">{items.length}</span>
          )}
        </div>
        <ChevronRight size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-slate-50">
          {items?.length > 0 ? (
            <div className="space-y-2 mt-3">
              {items.map((item, i) => (
                <div key={i} className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2.5">{renderItem(item)}</div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 mt-3">{emptyMsg}</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Access Control Page ───────────────────────────────────────────────────────
export function AccessPage() {
  const { api } = useAuth()
  const [grants, setGrants]       = useState([])
  const [log, setLog]             = useState([])
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('active')
  const [modal, setModal]         = useState(false)
  // staffList loaded from hospital portal API for the dropdown
  const [staffList, setStaffList]         = useState([])
  const [staffLoading, setStaffLoading]   = useState(false)
  const [selectedStaff, setSelectedStaff] = useState(null)   // { username, role }
  const [sections, setSections]           = useState(['ehr', 'visits'])
  const [expiresAt, setExpiresAt]         = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')
  const [success, setSuccess]             = useState('')
  const [actionLoading, setActionLoading] = useState('')   // requestId being approved/rejected


  const load = async () => {
    try {
      const [aRes, logRes, reqRes] = await Promise.allSettled([
        api().get('/access'),
        api().get('/access/log'),
        api().get('/access/requests'),
      ])
      if (aRes.status === 'fulfilled') {
        const d = aRes.value.data.data
        setGrants(d.grants || [])
      }
      if (logRes.status === 'fulfilled') setLog(logRes.value.data.data || [])
      if (reqRes.status === 'fulfilled') setRequests(reqRes.value.data.data || [])
    } finally { setLoading(false) }
  }

  // Load hospital staff for the grant dropdown.
  // Calls the peer0 (admin) API which manages the user directory.
  const loadStaff = async () => {
    setStaffLoading(true)
    try {
      const res = await fetch('http://localhost:3001/auth/staff', {
        headers: { 'Content-Type': 'application/json' }
      })
      if (res.ok) {
        const json = await res.json()
        const clinical = json.data || []
        setStaffList(clinical)
        if (clinical.length > 0 && !selectedStaff) {
          setSelectedStaff(clinical[0])
        }
      }
    } catch (_) {
      // Staff list unavailable — patient can still type manually via fallback
    } finally {
      setStaffLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openGrantModal = () => {
    setModal(true)
    setError('')
    loadStaff()
  }

  const activeGrants  = grants.filter(g => !g.revoked && (!g.expiresAt || g.expiresAt > new Date().toISOString()))
  const revokedGrants = grants.filter(g => g.revoked || (g.expiresAt && g.expiresAt <= new Date().toISOString()))

  const grantAccess = async () => {
    if (!selectedStaff) { setError('Please select a staff member'); return }
    setSaving(true); setError('')
    // IMPORTANT: granteeId MUST be the Fabric identity CN, which equals the role name
    // (the gateway uses a shared MSP per role: users/doctor/msp CN=doctor).
    // Granting to the role string ensures the chaincode userId check passes.
    const granteeId   = selectedStaff.role   // Fabric CN = role name (shared identity)
    const granteeRole = selectedStaff.role
    try {
      await api().post('/access/grant', { granteeId, granteeRole, sections, expiresAt })
      setSuccess(`Access granted to ${selectedStaff.username} (${granteeRole})`)
      setModal(false); setSelectedStaff(staffList[0] || null); load()
    } catch (err) { setError(err.response?.data?.error || 'Grant failed') }
    finally { setSaving(false) }
  }

  const revokeAccess = async (id) => {
    if (!confirm(`Revoke access for ${id}?`)) return
    try {
      await api().delete(`/access/revoke/${id}`, { data: { reason: 'Revoked by patient' } })
      setSuccess(`Access revoked for ${id}`)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Revoke failed') }
  }

  const approveRequest = async (requestId, reqExpiresAt = '') => {
    setActionLoading(requestId); setError('')
    try {
      await api().post(`/access/requests/${requestId}/approve`, { expiresAt: reqExpiresAt })
      setSuccess('Access request approved')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Approve failed') }
    finally { setActionLoading('') }
  }

  const rejectRequest = async (requestId) => {
    setActionLoading(requestId + '-reject'); setError('')
    try {
      await api().post(`/access/requests/${requestId}/reject`, { reason: 'Rejected by patient' })
      setSuccess('Access request rejected')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Reject failed') }
    finally { setActionLoading('') }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const pendingRequests = requests.filter(r => r.status === 'PENDING')
  const SECTION_OPTIONS = ['ehr', 'visits', 'prescriptions', 'labResults', 'all']

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle>Access Control</SectionTitle>
        <Button variant="teal" size="sm" onClick={openGrantModal}>
          <Plus size={14} /> Grant Access
        </Button>
      </div>

      {success && <Alert type="success">{success}</Alert>}
      {error   && <Alert type="error">{error}</Alert>}

      {/* Info */}
      <Card className="p-4 bg-teal-50 border-teal-200">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-teal-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-teal-800">
            You control who can access your health records. Grant or revoke access at any time. All changes are permanently recorded on the blockchain.
          </p>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
        {[
          ['active',   `Active (${activeGrants.length})`],
          ['requests', pendingRequests.length > 0 ? `Requests (${pendingRequests.length})` : `Requests`],
          ['revoked',  `Revoked (${revokedGrants.length})`],
          ['log',      `Audit Log (${log.length})`],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors relative ${tab === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>
            {label}
            {id === 'requests' && pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'active' && (
        <div className="space-y-3">
          {activeGrants.length === 0 ? (
            <Card className="p-10 text-center">
              <Shield size={28} className="text-slate-200 mx-auto mb-3" />
              <p className="font-semibold text-slate-500">No active grants</p>
              <p className="text-sm text-slate-400 mt-1">Your records are private. Grant access to specific people.</p>
            </Card>
          ) : activeGrants.map(g => (
            <Card key={g.grantId} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={14} className="text-green-500" />
                    <span className="font-semibold text-slate-800 text-sm">{g.granteeId}</span>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{g.granteeRole}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {g.sections.map(s => (
                      <span key={s} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium">{s}</span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Granted {formatDate(g.grantedAt)}
                    {g.expiresAt && ` · Expires ${formatDate(g.expiresAt)}`}
                  </p>
                </div>
                <button onClick={() => revokeAccess(g.granteeId)}
                  className="text-xs text-red-500 font-semibold hover:text-red-600 transition-colors px-2 py-1 hover:bg-red-50 rounded-lg">
                  Revoke
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <Card className="p-10 text-center">
              <Clock size={28} className="text-slate-200 mx-auto mb-3" />
              <p className="font-semibold text-slate-500">No access requests</p>
              <p className="text-sm text-slate-400 mt-1">When a doctor or nurse requests EHR access, it will appear here.</p>
            </Card>
          ) : requests.map(r => {
            const isPending   = r.status === 'PENDING'
            const isApproved  = r.status === 'APPROVED'
            const statusStyle = isPending  ? 'text-amber-700 bg-amber-50 border-amber-200'
                              : isApproved ? 'text-green-700 bg-green-50 border-green-200'
                              :              'text-slate-500 bg-slate-50 border-slate-200'
            return (
              <Card key={r.requestId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusStyle}`}>{r.status}</span>
                      <span className="font-semibold text-slate-800 text-sm">{r.requesterId}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{r.requesterRole}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(r.sections || []).map(s => (
                        <span key={s} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full font-medium">{s}</span>
                      ))}
                    </div>
                    {r.reason && <p className="text-xs text-slate-500 mt-2 italic">"{r.reason}"</p>}
                    <p className="text-xs text-slate-400 mt-2">Requested {r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                    {!isPending && r.respondedAt && (
                      <p className="text-xs text-slate-400">
                        {isApproved ? 'Approved' : 'Rejected'} {new Date(r.respondedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  {isPending && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveRequest(r.requestId)}
                        disabled={actionLoading === r.requestId}
                        className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        {actionLoading === r.requestId ? <Spinner size="xs" /> : <CheckCircle size={12} />} Approve
                      </button>
                      <button
                        onClick={() => rejectRequest(r.requestId)}
                        disabled={actionLoading === r.requestId + '-reject'}
                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        {actionLoading === r.requestId + '-reject' ? <Spinner size="xs" /> : <X size={12} />} Reject
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'revoked' && (
        <div className="space-y-3">
          {revokedGrants.length === 0 ? (
            <Card className="p-8 text-center"><p className="text-slate-400 text-sm">No revoked grants</p></Card>
          ) : revokedGrants.map(g => (
            <Card key={g.grantId} className="p-4 opacity-60">
              <div className="flex items-center gap-2 mb-1">
                <X size={14} className="text-red-400" />
                <span className="font-medium text-slate-700 text-sm">{g.granteeId}</span>
              </div>
              <p className="text-xs text-slate-400">
                {g.revoked ? `Revoked ${formatDate(g.revokedAt)}` : `Expired ${formatDate(g.expiresAt)}`}
                {g.revokedReason && ` · ${g.revokedReason}`}
              </p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <Card className="p-5">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {log.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No audit events yet</p>
            ) : [...log].reverse().map((l, i) => {
              const actionColor = { GRANT: 'text-green-600 bg-green-50', REVOKE: 'text-red-600 bg-red-50', READ: 'text-blue-600 bg-blue-50' }[l.action] || 'text-slate-600 bg-slate-50'
              return (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${actionColor}`}>{l.action}</span>
                  <div>
                    <p className="text-sm text-slate-700">
                      {l.action === 'READ' ? `${l.by} (${l.role}) accessed ${l.section}` :
                       l.action === 'GRANT' ? `Granted ${l.granteeId} access to ${l.sections?.join(', ')}` :
                       `Revoked access for ${l.granteeId}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(l.at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Grant Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Grant Access" size="md">
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Staff Member</label>
            {staffLoading ? (
              <div className="px-4 py-3 text-sm text-slate-400 border border-slate-200 rounded-xl bg-slate-50 flex items-center gap-2">
                <Spinner size="xs" /> Loading staff directory...
              </div>
            ) : staffList.length === 0 ? (
              <div className="px-4 py-3 text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl">
                Staff directory unavailable. Ensure hospital portal is running.
              </div>
            ) : (
              <select 
                value={selectedStaff?.username || ''} 
                onChange={e => {
                  const s = staffList.find(x => x.username === e.target.value);
                  setSelectedStaff(s);
                }}
                className="px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                {staffList.map(s => (
                  <option key={s.username} value={s.username}>
                    {s.username} ({s.role.charAt(0).toUpperCase() + s.role.slice(1)})
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-slate-400 mt-0.5">
              Access will be granted to the shared role identity of the selected staff member.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Access to Sections</p>
            <div className="flex flex-wrap gap-2">
              {SECTION_OPTIONS.map(s => (
                <button key={s} type="button"
                  onClick={() => setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                  className={`px-3 py-1.5 text-sm font-medium rounded-xl border transition-colors ${sections.includes(s) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Expires (optional)</label>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setModal(false)}>Cancel</Button>
            <Button variant="teal" size="sm" loading={saving || staffLoading} onClick={grantAccess}>Grant Access</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Signatures Page ───────────────────────────────────────────────────────────
const ROLE_COLORS = {
  doctor:           'bg-blue-50 text-blue-700 border-blue-100',
  nurse:            'bg-teal-50 text-teal-700 border-teal-100',
  pharmacist:       'bg-violet-50 text-violet-700 border-violet-100',
  medrecordofficer: 'bg-amber-50 text-amber-700 border-amber-100',
  receptionist:     'bg-slate-50 text-slate-700 border-slate-100',
  admin:            'bg-slate-50 text-slate-700 border-slate-100',
  staff:            'bg-slate-50 text-slate-600 border-slate-100',
  system:           'bg-gray-50 text-gray-500 border-gray-100',
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function fmtTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}
function shortTx(txId) {
  if (!txId || txId.startsWith('ehr-')) return txId
  return `${txId.slice(0, 10)}…${txId.slice(-8)}`
}

function TxRow({ item }) {
  const roleClass  = ROLE_COLORS[item.actorRole || item.role] || ROLE_COLORS.staff
  const sigDisplay = item.txId ? `tx: ${shortTx(item.txId)}` : item.cid ? `cid: ${item.cid.slice(0, 12)}…${item.cid.slice(-8)}` : null
  return (
    <div className="py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${roleClass}`}>
              {item.actorRole || item.role || 'staff'}
            </span>
            <span className="text-sm font-medium text-slate-800">{item.actor}</span>
          </div>
          <p className="text-sm text-slate-600">{item.action}</p>
          {item.section && <p className="text-xs text-slate-400 mt-0.5">Section: {item.section}</p>}
          {sigDisplay && <p className="font-mono text-xs text-slate-400 mt-1">{sigDisplay}</p>}
        </div>
        <div className="text-right flex-shrink-0 text-xs text-slate-400">
          <p>{fmtDate(item.timestamp)}</p>
          <p>{fmtTime(item.timestamp)}</p>
        </div>
      </div>
    </div>
  )
}

function AggregatePanel({ hash, txCount, verifyUrl, api }) {
  const [copied, setCopied]       = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult]       = useState(null)

  const copyHash = () => {
    if (!hash) return
    navigator.clipboard.writeText(hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const verify = async () => {
    setVerifying(true); setResult(null)
    try {
      const res = await api().get(`${verifyUrl}?hash=${hash}`)
      setResult(res.data.data)
    } catch { setResult({ valid: false }) }
    finally { setVerifying(false) }
  }

  if (!hash) return <p className="text-sm text-slate-400 mt-2">No transactions yet</p>

  return (
    <div className="mt-3 space-y-3">
      <div className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center gap-2">
        <p className="font-mono text-xs text-slate-700 break-all flex-1">{hash}</p>
        <button onClick={copyHash}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
          {copied ? <CheckCircle2 size={15} className="text-teal-500" /> : <Copy size={15} />}
        </button>
      </div>
      {result && (
        <Alert type={result.valid ? 'success' : 'error'}>
          {result.valid
            ? `${result.txCount} transaction${result.txCount !== 1 ? 's' : ''} verified — ledger data is consistent`
            : 'Hash mismatch — ledger data may have changed'}
        </Alert>
      )}
      <div className="flex justify-end">
        <Button variant="teal" size="sm" loading={verifying} onClick={verify}>
          <CheckCircle size={13} /> Verify
        </Button>
      </div>
    </div>
  )
}

function SigSection({ title, icon: Icon, color, txCount, hash, verifyUrl, interactions, api }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="overflow-hidden">
      {/* Header — always visible */}
      <div className="p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <Icon size={15} className={color} />
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{txCount} tx</span>
        </div>
        <AggregatePanel hash={hash} txCount={txCount} verifyUrl={verifyUrl} api={api} />
      </div>

      {/* Individual signatures toggle */}
      {interactions?.length > 0 && (
        <>
          <button onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-3 border-t border-slate-50 hover:bg-slate-50 transition-colors">
            <span className="text-xs font-semibold text-slate-500">Individual Signatures ({interactions.length})</span>
            <ChevronRight size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
          {open && (
            <div className="px-5 pb-3 max-h-96 overflow-y-auto">
              {[...interactions].reverse().map((item, i) => <TxRow key={item.txId + i} item={item} />)}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

export function SignaturesPage() {
  const { api } = useAuth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await api().get('/signatures')
      setData(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load signatures')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const totalTx = (data?.ehr?.txCount || 0) + (data?.visits?.reduce((s, v) => s + v.txCount, 0) || 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle>Blockchain Signatures</SectionTitle>
        <button onClick={load} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {data && totalTx === 0 && (
        <Card className="p-12 text-center">
          <Fingerprint size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-500">No transactions yet</p>
          <p className="text-sm text-slate-400 mt-1">Blockchain interactions will appear here once you have visits or EHR records.</p>
        </Card>
      )}

      {/* EHR Signatures */}
      {data?.ehr && (
        <SigSection
          title="EHR Record"
          icon={FileText}
          color="text-teal-600"
          txCount={data.ehr.txCount}
          hash={data.ehr.aggregateHash}
          verifyUrl="/signatures/verify/ehr"
          interactions={data.ehr.interactions}
          api={api}
        />
      )}

      {/* Per-Visit Signatures */}
      {data?.visits?.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">Visits ({data.visits.length})</p>
          {[...data.visits].reverse().map(v => (
            <SigSection
              key={v.visitId}
              title={v.visitId}
              icon={Calendar}
              color="text-blue-500"
              txCount={v.txCount}
              hash={v.aggregateHash}
              verifyUrl={`/signatures/verify/visit/${v.visitId}`}
              interactions={v.interactions}
              api={api}
            />
          ))}
        </div>
      )}
    </div>
  )
}
