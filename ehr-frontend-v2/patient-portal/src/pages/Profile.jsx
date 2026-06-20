import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, Spinner, SectionTitle, Modal, Button, Input, Alert } from '../components/ui'
import { formatDate, formatDateTime } from '../utils/api'
import { User, Lock, LogOut, ChevronRight } from 'lucide-react'

export default function ProfilePage() {
  const { api, patient, logout } = useAuth()
  const [profile, setProfile]     = useState(null)
  const [history, setHistory]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [passModal, setPassModal] = useState(false)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass]         = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')

  useEffect(() => {
    Promise.allSettled([
      api().get('/profile'),
      api().get('/profile/history'),
    ]).then(([pRes, hRes]) => {
      if (pRes.status === 'fulfilled') setProfile(pRes.value.data.data)
      if (hRes.status === 'fulfilled') setHistory(hRes.value.data.data || [])
    }).finally(() => setLoading(false))
  }, [])

  const changePassword = async () => {
    if (newPass.length < 6) { setError('Password must be at least 6 characters'); return }
    setSaving(true); setError('')
    try {
      await api().put('/auth/password', { currentPassword: currentPass, newPassword: newPass })
      setSuccess('Password changed successfully')
      setPassModal(false); setCurrentPass(''); setNewPass('')
    } catch (err) { setError(err.response?.data?.error || 'Failed to change password') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <SectionTitle>My Profile</SectionTitle>

      {success && <Alert type="success">{success}</Alert>}

      {/* Avatar + ID */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl font-bold text-white">
            {profile?.name?.[0]?.toUpperCase() || 'P'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: 'Playfair Display, serif' }}>
              {profile?.name || 'Patient'}
            </h2>
            <p className="font-mono text-sm text-slate-400 mt-0.5">{patient?.patientId}</p>
            <p className="text-xs text-slate-400 mt-1">
              Member since {formatDate(profile?.createdAt)}
            </p>
          </div>
        </div>
      </Card>

      {/* Account Info */}
      <Card className="p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Account</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-sm text-slate-500">Patient ID</span>
            <span className="font-mono text-sm font-semibold text-slate-800">{patient?.patientId}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-sm text-slate-500">Email</span>
            <span className="text-sm font-medium text-slate-700">{patient?.email || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-500">Phone</span>
            <span className="text-sm font-medium text-slate-700">{patient?.phone || '—'}</span>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <Card className="overflow-hidden">
        <button onClick={() => setPassModal(true)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors border-b border-slate-50">
          <div className="flex items-center gap-3">
            <Lock size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Change Password</span>
          </div>
          <ChevronRight size={14} className="text-slate-400" />
        </button>
        <button onClick={logout}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-red-50 transition-colors">
          <div className="flex items-center gap-3">
            <LogOut size={16} className="text-red-400" />
            <span className="text-sm font-medium text-red-600">Sign Out</span>
          </div>
          <ChevronRight size={14} className="text-red-300" />
        </button>
      </Card>

      {/* Blockchain Record History */}
      {history.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            On-Chain Record History ({history.length} entries)
          </p>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {history.slice(0, 10).map((h, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-mono text-xs text-slate-400 truncate max-w-[200px]">{h.txId}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(h.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Change Password Modal */}
      <Modal open={passModal} onClose={() => setPassModal(false)} title="Change Password" size="sm">
        <div className="space-y-4">
          <Input label="Current Password" type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} placeholder="Current password" />
          <Input label="New Password" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min. 6 characters" />
          {error && <Alert type="error">{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setPassModal(false)}>Cancel</Button>
            <Button variant="teal" size="sm" loading={saving} onClick={changePassword}>Change Password</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
