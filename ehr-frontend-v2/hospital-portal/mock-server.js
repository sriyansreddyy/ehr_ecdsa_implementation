import http from 'http'

const PORTS = [3001, 3002, 3003]

const nowIso = () => new Date().toISOString()
const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString()

const staff = [
  { username: 'doctor', role: 'doctor' },
  { username: 'nurse', role: 'nurse' },
  { username: 'pharmacist', role: 'pharmacist' },
  { username: 'medrecordofficer', role: 'medrecordofficer' },
  { username: 'receptionist', role: 'receptionist' },
  { username: 'hospitaladmin', role: 'admin' },
]

const patients = [
  {
    patientId: 'PAT-001',
    name: 'abc',
    age: 20,
    gender: 'Male',
    bloodGroup: 'O+',
    contact: '9876543210',
    address: 'Earth',
    visitCount: 2,
  },
  {
    patientId: 'PAT-002',
    name: 'def',
    age: 25,
    gender: 'Female',
    bloodGroup: 'A+',
    contact: '9123456780',
    address: 'Moon',
    visitCount: 1,
  },
]

const visits = [
  {
    visitId: 'PAT-001-V1',
    patientId: 'PAT-001',
    status: 'WITH_DOCTOR',
    assignedDoctor: 'doctor',
    assignedNurse: 'nurse',
    visitNumber: 1,
    createdAt: isoDaysAgo(4),
    visitCID: 'bafybeigdyrmockcid001',
    cidHistory: [
      {
        cid: 'bafybeigdyrmockcid001',
        reason: 'Visit opened',
        updatedBy: 'receptionist',
        updatedAt: isoDaysAgo(4),
      },
    ],
  },
  {
    visitId: 'PAT-001-V2',
    patientId: 'PAT-001',
    status: 'VISIT_FINALIZED',
    assignedDoctor: 'doctor',
    assignedNurse: 'nurse',
    visitNumber: 2,
    createdAt: isoDaysAgo(1),
    visitCID: 'bafybeigdyrmockcid002',
    cidHistory: [
      {
        cid: 'bafybeigdyrmockcid002',
        reason: 'Visit opened',
        updatedBy: 'receptionist',
        updatedAt: isoDaysAgo(1),
      },
      {
        cid: 'bafybeigdyrmockcid003',
        reason: 'Doctor finalized',
        updatedBy: 'doctor',
        updatedAt: isoDaysAgo(0),
      },
    ],
    claimId: 'CLAIM-001',
    claimAmount: 1200,
    claimStatus: 'CLAIM_SUBMITTED',
  },
  {
    visitId: 'PAT-002-V1',
    patientId: 'PAT-002',
    status: 'WITH_NURSE',
    assignedDoctor: 'doctor',
    assignedNurse: 'nurse',
    visitNumber: 1,
    createdAt: isoDaysAgo(2),
    visitCID: 'bafybeigdyrmockcid004',
    cidHistory: [
      {
        cid: 'bafybeigdyrmockcid004',
        reason: 'Visit opened',
        updatedBy: 'receptionist',
        updatedAt: isoDaysAgo(2),
      },
    ],
  },
]

const clinicalByVisit = {
  'PAT-001-V1': {
    chiefComplaint: 'Fever and headache',
    diagnosisNotes: 'Likely viral fever. Monitor for 48 hours.',
    finalDiagnosis: '',
    vitals: {
      bloodPressure: '120/80',
      temperature: '98.6 F',
      pulse: '78',
      weight: '72 kg',
      height: '175 cm',
      oxygenSat: '98%',
      recordedBy: 'nurse',
      recordedAt: isoDaysAgo(4),
    },
    prescriptions: [
      {
        version: 1,
        medications: ['Paracetamol 500mg', 'ORS 1 sachet'],
        instructions: 'After meals for 3 days',
        prescribedBy: 'doctor',
        prescribedAt: isoDaysAgo(4),
      },
    ],
    careNotes: [
      {
        note: 'Patient resting. No nausea.',
        recordedBy: 'nurse',
        recordedAt: isoDaysAgo(3),
      },
    ],
  },
  'PAT-001-V2': {
    chiefComplaint: 'Cough and fatigue',
    diagnosisNotes: 'Upper respiratory infection',
    finalDiagnosis: 'URI - resolved',
    vitals: {
      bloodPressure: '118/76',
      temperature: '98.2 F',
      pulse: '82',
      weight: '71 kg',
      height: '175 cm',
      oxygenSat: '99%',
      recordedBy: 'nurse',
      recordedAt: isoDaysAgo(1),
    },
    prescriptions: [
      {
        version: 1,
        medications: ['Cough syrup 10ml'],
        instructions: 'Twice daily for 5 days',
        prescribedBy: 'doctor',
        prescribedAt: isoDaysAgo(1),
      },
    ],
    careNotes: [],
    medicationDetails: 'Cough syrup 10ml as prescribed',
    medicationDispensedBy: 'pharmacist',
    medicationDispensedAt: isoDaysAgo(0),
  },
  'PAT-002-V1': {
    chiefComplaint: 'Abdominal pain',
    diagnosisNotes: 'Under observation',
    finalDiagnosis: '',
    vitals: {
      bloodPressure: '125/82',
      temperature: '99.1 F',
      pulse: '90',
      weight: '60 kg',
      height: '165 cm',
      oxygenSat: '97%',
      recordedBy: 'nurse',
      recordedAt: isoDaysAgo(2),
    },
    prescriptions: [],
    careNotes: [],
  },
}

const ehrByVisit = {
  'PAT-001-V1': {
    allergies: ['Penicillin'],
    conditions: ['Diabetes'],
    notes: 'Family history of hypertension.',
  },
  'PAT-001-V2': {
    allergies: ['None'],
    conditions: ['Asthma'],
    notes: 'Uses inhaler as needed.',
  },
  'PAT-002-V1': {
    allergies: ['Peanuts'],
    conditions: ['GERD'],
    notes: 'Dietary restrictions advised.',
  },
}

const readBody = (req) => new Promise((resolve) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    if (!body) return resolve({})
    try { resolve(JSON.parse(body)) } catch { resolve({}) }
  })
})

const sendJson = (res, status, payload) => {
  const data = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  })
  res.end(data)
}

const roleFromUsername = (username = '') => {
  const name = username.toLowerCase()
  if (name.includes('doctor')) return 'doctor'
  if (name.includes('nurse')) return 'nurse'
  if (name.includes('pharmacist')) return 'pharmacist'
  if (name.includes('medrecord')) return 'medrecordofficer'
  if (name.includes('admin')) return 'admin'
  if (name.includes('receptionist')) return 'receptionist'
  return 'receptionist'
}

const findVisit = (id) => visits.find((v) => v.visitId === id)

const ensureClinical = (visitId) => {
  if (!clinicalByVisit[visitId]) {
    clinicalByVisit[visitId] = {
      chiefComplaint: '',
      diagnosisNotes: '',
      finalDiagnosis: '',
      vitals: null,
      prescriptions: [],
      careNotes: [],
    }
  }
  return clinicalByVisit[visitId]
}

const handleRequest = async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 200, { success: true })

  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  if (req.method === 'POST' && path === '/auth/login') {
    const body = await readBody(req)
    const role = roleFromUsername(body.username)
    return sendJson(res, 200, {
      success: true,
      data: {
        token: `mock-token-${role}`,
        user: { username: body.username || role, role },
      },
    })
  }

  if (req.method === 'GET' && path === '/auth/users') {
    return sendJson(res, 200, { success: true, data: staff })
  }

  if (req.method === 'POST' && path === '/auth/users') {
    const body = await readBody(req)
    if (!body.username || !body.role) {
      return sendJson(res, 400, { error: 'username and role are required' })
    }
    staff.push({ username: body.username, role: body.role })
    return sendJson(res, 200, { success: true })
  }

  if (req.method === 'GET' && path === '/patients') {
    return sendJson(res, 200, { success: true, data: patients })
  }

  if (req.method === 'POST' && path === '/patients') {
    const body = await readBody(req)
    const newPatient = {
      patientId: body.patientId || `PAT-${String(patients.length + 1).padStart(3, '0')}`,
      name: body.name || 'New Patient',
      age: body.age || 0,
      gender: body.gender || 'Other',
      bloodGroup: body.bloodGroup || 'O+',
      contact: body.contact || '',
      address: body.address || '',
      visitCount: 0,
    }
    patients.unshift(newPatient)
    return sendJson(res, 200, { success: true, data: newPatient })
  }

  const patientVisitsMatch = path.match(/^\/patients\/([^/]+)\/visits\/full$/)
  if (req.method === 'GET' && patientVisitsMatch) {
    const patientId = patientVisitsMatch[1]
    const data = visits.filter((v) => v.patientId === patientId)
    return sendJson(res, 200, { success: true, data })
  }

  if (req.method === 'GET' && path === '/visits') {
    return sendJson(res, 200, { success: true, data: visits })
  }

  const visitMatch = path.match(/^\/visits\/([^/]+)$/)
  if (req.method === 'GET' && visitMatch) {
    const visit = findVisit(visitMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    return sendJson(res, 200, { success: true, data: visit })
  }

  if (req.method === 'POST' && path === '/visits') {
    const body = await readBody(req)
    const patientId = body.patientId || 'PAT-NEW'
    const visitId = `${patientId}-V${Math.floor(Math.random() * 900 + 100)}`
    const newVisit = {
      visitId,
      patientId,
      status: 'OPEN',
      assignedDoctor: '',
      assignedNurse: '',
      visitNumber: 1,
      createdAt: nowIso(),
      visitCID: 'bafybeigdyrmockcidnew',
      cidHistory: [
        {
          cid: 'bafybeigdyrmockcidnew',
          reason: 'Visit opened',
          updatedBy: 'receptionist',
          updatedAt: nowIso(),
        },
      ],
    }
    visits.unshift(newVisit)
    ensureClinical(visitId).chiefComplaint = body.chiefComplaint || ''
    return sendJson(res, 200, { success: true, data: newVisit })
  }

  const assignDoctorMatch = path.match(/^\/visits\/([^/]+)\/doctor$/)
  if (req.method === 'PUT' && assignDoctorMatch) {
    const body = await readBody(req)
    const visit = findVisit(assignDoctorMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.assignedDoctor = body.doctorId || visit.assignedDoctor
    visit.status = 'WITH_DOCTOR'
    return sendJson(res, 200, { success: true })
  }

  const assignNurseMatch = path.match(/^\/visits\/([^/]+)\/nurse$/)
  if (req.method === 'PUT' && assignNurseMatch) {
    const body = await readBody(req)
    const visit = findVisit(assignNurseMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.assignedNurse = body.nurseId || visit.assignedNurse
    visit.status = 'WITH_NURSE'
    return sendJson(res, 200, { success: true })
  }

  const dischargeMatch = path.match(/^\/visits\/([^/]+)\/discharge$/)
  if (req.method === 'PUT' && dischargeMatch) {
    const visit = findVisit(dischargeMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.status = 'DISCHARGED'
    return sendJson(res, 200, { success: true })
  }

  if (req.method === 'GET' && path === '/doctor/visits') {
    return sendJson(res, 200, { success: true, data: visits })
  }

  const doctorVisitMatch = path.match(/^\/doctor\/visits\/([^/]+)$/)
  if (req.method === 'GET' && doctorVisitMatch) {
    const visit = findVisit(doctorVisitMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    const clinical = ensureClinical(visit.visitId)
    return sendJson(res, 200, { success: true, data: { ...visit, clinical } })
  }

  const doctorEhrMatch = path.match(/^\/doctor\/visits\/([^/]+)\/ehr$/)
  if (req.method === 'GET' && doctorEhrMatch) {
    const visitId = doctorEhrMatch[1]
    return sendJson(res, 200, { success: true, data: { ehr: ehrByVisit[visitId] || null } })
  }

  const doctorRequestMatch = path.match(/^\/doctor\/visits\/([^/]+)\/request-access$/)
  if (req.method === 'POST' && doctorRequestMatch) {
    return sendJson(res, 200, { success: true })
  }

  const diagnosisMatch = path.match(/^\/doctor\/visits\/([^/]+)\/diagnosis$/)
  if (req.method === 'PUT' && diagnosisMatch) {
    const body = await readBody(req)
    const clinical = ensureClinical(diagnosisMatch[1])
    clinical.diagnosisNotes = body.notes || clinical.diagnosisNotes
    return sendJson(res, 200, { success: true })
  }

  const prescriptionMatch = path.match(/^\/doctor\/visits\/([^/]+)\/prescription$/)
  if (req.method === 'PUT' && prescriptionMatch) {
    const body = await readBody(req)
    const clinical = ensureClinical(prescriptionMatch[1])
    const nextVersion = (clinical.prescriptions?.length || 0) + 1
    clinical.prescriptions = clinical.prescriptions || []
    clinical.prescriptions.push({
      version: nextVersion,
      medications: body.medications || [],
      instructions: body.instructions || '',
      prescribedBy: 'doctor',
      prescribedAt: nowIso(),
    })
    return sendJson(res, 200, { success: true })
  }

  const forwardNurseMatch = path.match(/^\/doctor\/visits\/([^/]+)\/forward\/nurse$/)
  if (req.method === 'PUT' && forwardNurseMatch) {
    const visit = findVisit(forwardNurseMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.status = 'WITH_NURSE'
    return sendJson(res, 200, { success: true })
  }

  const forwardLabMatch = path.match(/^\/doctor\/visits\/([^/]+)\/forward\/lab$/)
  if (req.method === 'PUT' && forwardLabMatch) {
    const visit = findVisit(forwardLabMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.status = 'WITH_LAB'
    return sendJson(res, 200, { success: true })
  }

  const doctorFinalizeMatch = path.match(/^\/doctor\/visits\/([^/]+)\/finalize$/)
  if (req.method === 'PUT' && doctorFinalizeMatch) {
    const body = await readBody(req)
    const visit = findVisit(doctorFinalizeMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.status = 'VISIT_FINALIZED'
    ensureClinical(visit.visitId).finalDiagnosis = body.finalDiagnosis || ''
    return sendJson(res, 200, { success: true })
  }

  if (req.method === 'GET' && path === '/nurse/visits') {
    return sendJson(res, 200, { success: true, data: visits })
  }

  const nurseVisitMatch = path.match(/^\/nurse\/visits\/([^/]+)$/)
  if (req.method === 'GET' && nurseVisitMatch) {
    const visit = findVisit(nurseVisitMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    const clinical = ensureClinical(visit.visitId)
    return sendJson(res, 200, { success: true, data: { ...visit, clinical } })
  }

  const nurseVitalsMatch = path.match(/^\/nurse\/visits\/([^/]+)\/vitals$/)
  if (req.method === 'PUT' && nurseVitalsMatch) {
    const body = await readBody(req)
    const clinical = ensureClinical(nurseVitalsMatch[1])
    clinical.vitals = { ...body.vitals, recordedBy: 'nurse', recordedAt: nowIso() }
    return sendJson(res, 200, { success: true })
  }

  const nurseCareMatch = path.match(/^\/nurse\/visits\/([^/]+)\/carenote$/)
  if (req.method === 'POST' && nurseCareMatch) {
    const body = await readBody(req)
    const clinical = ensureClinical(nurseCareMatch[1])
    clinical.careNotes = clinical.careNotes || []
    clinical.careNotes.push({ note: body.note || '', recordedBy: 'nurse', recordedAt: nowIso() })
    return sendJson(res, 200, { success: true })
  }

  const nurseForwardMatch = path.match(/^\/nurse\/visits\/([^/]+)\/forward\/doctor$/)
  if (req.method === 'PUT' && nurseForwardMatch) {
    const visit = findVisit(nurseForwardMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.status = 'WITH_DOCTOR'
    return sendJson(res, 200, { success: true })
  }

  const nurseEhrMatch = path.match(/^\/nurse\/visits\/([^/]+)\/ehr$/)
  if (req.method === 'PUT' && nurseEhrMatch) {
    const body = await readBody(req)
    const visitId = nurseEhrMatch[1]
    const current = ehrByVisit[visitId] || {}
    ehrByVisit[visitId] = { ...current, [body.section]: body.data }
    return sendJson(res, 200, { success: true })
  }

  const nurseRequestMatch = path.match(/^\/nurse\/visits\/([^/]+)\/request-access$/)
  if (req.method === 'POST' && nurseRequestMatch) {
    return sendJson(res, 200, { success: true })
  }

  if (req.method === 'GET' && path === '/pharmacist/visits') {
    return sendJson(res, 200, { success: true, data: visits })
  }

  const pharmacistVisitMatch = path.match(/^\/pharmacist\/visits\/([^/]+)$/)
  if (req.method === 'GET' && pharmacistVisitMatch) {
    const visit = findVisit(pharmacistVisitMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    const clinical = ensureClinical(visit.visitId)
    return sendJson(res, 200, { success: true, data: { ...visit, clinical } })
  }

  const dispenseMatch = path.match(/^\/pharmacist\/visits\/([^/]+)\/dispense$/)
  if (req.method === 'PUT' && dispenseMatch) {
    const body = await readBody(req)
    const clinical = ensureClinical(dispenseMatch[1])
    clinical.medicationDetails = body.medicationDetails || ''
    clinical.medicationDispensedBy = 'pharmacist'
    clinical.medicationDispensedAt = nowIso()
    return sendJson(res, 200, { success: true })
  }

  if (req.method === 'GET' && path === '/records/visits') {
    return sendJson(res, 200, { success: true, data: visits })
  }

  const recordsVisitMatch = path.match(/^\/records\/visits\/([^/]+)$/)
  if (req.method === 'GET' && recordsVisitMatch) {
    const visit = findVisit(recordsVisitMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    const clinical = ensureClinical(visit.visitId)
    return sendJson(res, 200, { success: true, data: { ...visit, clinical } })
  }

  const recordsFinalizeMatch = path.match(/^\/records\/visits\/([^/]+)\/finalize$/)
  if (req.method === 'PUT' && recordsFinalizeMatch) {
    const visit = findVisit(recordsFinalizeMatch[1])
    if (!visit) return sendJson(res, 404, { error: 'Visit not found' })
    visit.status = 'RECORD_FINALIZED'
    return sendJson(res, 200, { success: true })
  }

  return sendJson(res, 404, { error: 'Not found' })
}

PORTS.forEach((port) => {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      sendJson(res, 500, { error: 'Mock server error' })
    })
  })

  server.listen(port, () => {
    console.log(`Mock API listening on http://localhost:${port}`)
  })
})
