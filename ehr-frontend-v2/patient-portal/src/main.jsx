import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Overview from './pages/Overview'
import { VisitsListPage, VisitDetailPage } from './pages/Visits'
import { EHRPage, AccessPage, SignaturesPage } from './pages/EHRAccess'
import Profile from './pages/Profile'
import './index.css'

function ProtectedRoute({ children }) {
  const { patient } = useAuth()
  if (!patient) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { patient } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={patient ? <Navigate to="/overview" replace /> : <Login />} />

      <Route path="/overview" element={
        <ProtectedRoute><Layout><Overview /></Layout></ProtectedRoute>
      } />
      <Route path="/visits" element={
        <ProtectedRoute><Layout><VisitsListPage /></Layout></ProtectedRoute>
      } />
      <Route path="/visits/:id" element={
        <ProtectedRoute><Layout><VisitDetailPage /></Layout></ProtectedRoute>
      } />
      <Route path="/ehr" element={
        <ProtectedRoute><Layout><EHRPage /></Layout></ProtectedRoute>
      } />
      <Route path="/access" element={
        <ProtectedRoute><Layout><AccessPage /></Layout></ProtectedRoute>
      } />
      <Route path="/signatures" element={
        <ProtectedRoute><Layout><SignaturesPage /></Layout></ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>
      } />

      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
