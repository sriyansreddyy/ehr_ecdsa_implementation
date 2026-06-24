import { useState, useEffect, useRef } from 'react'
import { Lock, X } from 'lucide-react'

/**
 * PinModal
 * --------
 * Shown before any action that triggers ECDSA signing on the backend.
 * The PIN is sent as the X-Actor-Pin header and is never stored anywhere.
 *
 * Usage:
 *
 *   const [pinModal, setPinModal] = useState({ open: false, onConfirm: null, label: '' })
 *
 *   // Where you'd normally call the API directly:
 *   setPinModal({
 *     open: true,
 *     label: 'Sign Diagnosis Notes',
 *     onConfirm: async (pin) => {
 *       await api().put(`/doctor/visits/${visitId}/diagnosis`, payload, {
 *         headers: { 'X-Actor-Pin': pin }
 *       })
 *     }
 *   })
 *
 *   <PinModal
 *     open={pinModal.open}
 *     label={pinModal.label}
 *     onConfirm={pinModal.onConfirm}
 *     onClose={() => setPinModal({ open: false, onConfirm: null, label: '' })}
 *   />
 */
export default function PinModal({ open, label = 'Authorize Action', onConfirm, onClose }) {
  const [pin, setPin]         = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const inputRef              = useRef(null)

  // Reset state and focus when modal opens
  useEffect(() => {
    if (open) {
      setPin('')
      setError('')
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (pin.length < 4) return
    setLoading(true)
    setError('')
    try {
      await onConfirm(pin)
      onClose()
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Action failed'
      setError(msg)
      setPin('')            // clear PIN from state on failure
    } finally {
      setLoading(false)
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Lock size={16} className="text-white" />
            </div>
            <div>
              <p className="text-white font-medium text-sm">{label}</p>
              <p className="text-slate-500 text-xs mt-0.5">Enter your PIN to authorize</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Enter PIN"
              className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-white/20 placeholder-slate-500"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white/5 border border-white/10 text-slate-300 rounded-xl py-2.5 text-sm hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="flex-1 bg-white text-slate-900 font-semibold rounded-xl py-2.5 text-sm hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
                : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}