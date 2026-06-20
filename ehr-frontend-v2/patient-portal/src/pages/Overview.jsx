import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Spinner, VisitStatusBadge, SectionTitle } from '../components/ui'
import { formatDate, VISIT_STATUS_INFO } from '../utils/api'
import { Heart, Calendar, ChevronRight, AlertCircle, Activity, Pill, Shield } from 'lucide-react'

export default function OverviewPage() {
  const { api, patient } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [visits, setVisits]   = useState([])
  const [ehr, setEhr]         = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [pRes, vRes, ehrCIDRes] = await Promise.allSettled([
          api().get('/profile'),
          api().get('/visits'),
          api().get('/ehr'),
        ])
        if (pRes.status === 'fulfilled') setProfile(pRes.value.data.data)
        if (vRes.status === 'fulfilled') setVisits(vRes.value.data.data || [])
        if (ehrCIDRes.status === 'fulfilled') setEhr(ehrCIDRes.value.data.data?.ehr || null)
      } finally { setLoading(false) }
    }
    load()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const activeVisit  = visits.find(v => !['DISCHARGED'].includes(v.status))
  const latestVisit  = visits[visits.length - 1]
  const allergies    = ehr?.allergies || []
  const conditions   = ehr?.chronicConditions || []

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Playfair Display, serif' }}>
          Hello, {profile?.name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">{formatDate(new Date().toISOString())} · Patient ID: <span className="font-mono font-medium text-slate-700">{patient?.patientId}</span></p>
      </div>

      {/* Active Visit Alert */}
      {activeVisit && (
        <Card className="p-4 bg-blue-50 border-blue-200 cursor-pointer" onClick={() => navigate(`/visits/${activeVisit.visitId}`)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Activity size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-900">Active Visit</p>
                <p className="text-xs text-blue-600 mt-0.5">{activeVisit.visitId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <VisitStatusBadge status={activeVisit.status} />
              <ChevronRight size={16} className="text-blue-400" />
            </div>
          </div>
        </Card>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          icon={Calendar}
          label="Total Visits"
          value={profile?.visitCount || 0}
          color="text-blue-600"
          bg="bg-blue-50"
          onClick={() => navigate('/visits')}
        />
        <StatTile
          icon={AlertCircle}
          label="Allergies"
          value={allergies.length}
          color="text-red-600"
          bg="bg-red-50"
          onClick={() => navigate('/ehr')}
        />
        <StatTile
          icon={Heart}
          label="Conditions"
          value={conditions.length}
          color="text-amber-600"
          bg="bg-amber-50"
          onClick={() => navigate('/ehr')}
        />
      </div>

      {/* Personal Info */}
      {profile && (
        <Card className="p-5">
          <SectionTitle>My Information</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              ['Name',        profile.name],
              ['Age',         `${profile.age} years`],
              ['Gender',      profile.gender],
              ['Blood Group', profile.bloodGroup],
              ['Contact',     profile.contact],
              ['Registered',  formatDate(profile.createdAt)],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="text-xs text-slate-400">{l}</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Health Summary */}
      {ehr && (allergies.length > 0 || conditions.length > 0) && (
        <Card className="p-5">
          <SectionTitle>Health Summary</SectionTitle>
          {allergies.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Known Allergies</p>
              <div className="flex flex-wrap gap-2">
                {allergies.slice(0, 5).map((a, i) => (
                  <span key={i} className="px-3 py-1 bg-red-50 border border-red-100 text-red-700 text-xs font-medium rounded-full">
                    {typeof a === 'string' ? a : `${a.substance} (${a.reaction})`}
                  </span>
                ))}
                {allergies.length > 5 && <span className="text-xs text-slate-400">+{allergies.length - 5} more</span>}
              </div>
            </div>
          )}
          {conditions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Chronic Conditions</p>
              <div className="flex flex-wrap gap-2">
                {conditions.slice(0, 5).map((c, i) => (
                  <span key={i} className="px-3 py-1 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-medium rounded-full">
                    {typeof c === 'string' ? c : c.condition}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Recent Visits */}
      {visits.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900" style={{ fontFamily: 'Playfair Display, serif' }}>Recent Visits</h2>
            <button onClick={() => navigate('/visits')} className="text-sm text-teal-600 font-semibold hover:text-teal-700">
              View all
            </button>
          </div>
          <div className="space-y-3">
            {[...visits].reverse().slice(0, 3).map(v => (
              <Card key={v.visitId} onClick={() => navigate(`/visits/${v.visitId}`)} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs text-slate-400">{v.visitId}</p>
                    <p className="text-sm font-semibold text-slate-800 mt-0.5">
                      {formatDate(v.createdAt)}
                    </p>
                    {v.assignedDoctor && (
                      <p className="text-xs text-slate-400 mt-0.5">Dr. {v.assignedDoctor}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <VisitStatusBadge status={v.status} />
                    <ChevronRight size={14} className="text-slate-300" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* EHR Blockchain Badge */}
      <Card className="p-4 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">Secured by Blockchain</p>
            <p className="text-slate-400 text-xs mt-0.5">
              All records are immutably stored on Hyperledger Fabric
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function StatTile({ icon: Icon, label, value, color, bg, onClick }) {
  return (
    <Card className="p-4" onClick={onClick}>
      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center mb-3`}>
        <Icon size={18} className={color} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </Card>
  )
}
