import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Input, Alert } from '../components/ui'
import { Calendar, ArrowRight } from 'lucide-react'
import KeyGateModal from '../components/security/KeyGateModal'

export default function OpenVisitPage() {
  const { api, userKey }   = useAuth()
  const navigate  = useNavigate()
  const [params]  = useSearchParams()
  const [form, setForm] = useState({
    patientId: params.get('patientId') || '',
    chiefComplaint: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [result, setResult]   = useState(null)
  const [keyGate, setKeyGate] = useState({ open: false, purpose: '', onApprove: null })

  const requestKey = (purpose, onApprove) => {
    setKeyGate({ open: true, purpose, onApprove })
  }

  const handleAuthorized = () => {
    const action = keyGate.onApprove
    setKeyGate({ open: false, purpose: '', onApprove: null })
    if (action) action()
  }

  const submitVisit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api().post('/visits', form)
      setResult(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to open visit')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    requestKey('Authorize open visit', submitVisit)
  }

  if (result) {
    return (
      <div className="max-w-lg mx-auto">
        <Card className="p-8 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar size={24} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-1" style={{ fontFamily: 'Fraunces, serif' }}>
            Visit Opened
          </h2>
          <p className="text-slate-500 text-sm mb-6">Visit has been registered and pinned to IPFS</p>
          <div className="bg-slate-50 rounded-xl p-4 text-left mb-6">
            <div className="space-y-2">
              <Row label="Visit ID" value={result.visitId} mono />
              <Row label="Patient" value={result.patientId} />
              <Row label="Status" value={result.status} />
              {result.visitCID && <Row label="IPFS CID" value={result.visitCID.slice(0,20) + '…'} mono />}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => { setResult(null); setForm({ patientId: '', chiefComplaint: '' }) }}>
              Open Another
            </Button>
            <Button className="flex-1" onClick={() => navigate(`/visits?visitId=${result.visitId}`)}>
              Manage Visit <ArrowRight size={14} />
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'Fraunces, serif' }}>Open Visit</h1>
        <p className="text-sm text-slate-500 mt-0.5">Register a new visit and initialise IPFS document</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Patient ID *"
            value={form.patientId}
            onChange={e => setForm(f => ({ ...f, patientId: e.target.value }))}
            placeholder="PAT-001"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Chief Complaint</label>
            <textarea
              value={form.chiefComplaint}
              onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))}
              rows={3}
              placeholder="Fever and headache for 3 days..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full justify-center">
            Open Visit &amp; Pin to IPFS
          </Button>
        </form>
      </Card>
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

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-medium text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}
