import { useState } from 'react'
import { Modal, Button, Alert } from '../ui'
import { KeyRound, Copy, CheckCircle } from 'lucide-react'
import { maskKey, matchesKey } from '../../utils/keyAuth'

export default function KeyGateModal({ open, onClose, onAuthorized, userKey, purpose }) {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('')
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState(false)

  if (!open) return null

  const reset = () => {
    setInput('')
    setStatus('')
    setCopied(false)
    setPasted(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userKey || '')
      setCopied(true)
      setStatus('Key copied to clipboard')
    } catch {
      setStatus('Copy failed. Try again.')
    }
  }

  const handlePaste = (e) => {
    setPasted(true)
    setStatus('Key pasted')
    setInput(e.clipboardData.getData('text') || '')
    e.preventDefault()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!matchesKey(input, userKey)) {
      setStatus('Key does not match. Please paste the correct key.')
      return
    }
    reset()
    onAuthorized()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Authorize Action" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900/10 flex items-center justify-center">
            <KeyRound size={16} className="text-slate-700" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Key Authorization Required</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {purpose || 'Confirm your key to proceed with this action.'}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl px-3 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Your Access Key</p>
              <p className="text-sm font-mono text-slate-700 mt-1">{maskKey(userKey)}</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleCopy} disabled={!userKey}>
              <Copy size={14} /> Copy
            </Button>
          </div>
          {(copied || pasted) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle size={12} /> {copied ? 'Key copied' : 'Key pasted'}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Paste key to authorize</label>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste key here"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {status && (
          <Alert type={status.includes('match') ? 'error' : 'info'}>{status}</Alert>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button type="submit" disabled={!userKey}>Authorize</Button>
        </div>
      </form>
    </Modal>
  )
}
