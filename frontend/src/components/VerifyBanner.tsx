import { useState } from 'react'
import { authApi } from '../api'
import { useToast } from '../context/ToastContext'
import { Spinner } from './ui'
import type { User } from '../types'

interface VerifyBannerProps {
  user: User
  onVerified: (user: User) => void
}

type Step = 'banner' | 'code'

export function VerifyBanner({ user, onVerified }: VerifyBannerProps) {
  const [step, setStep] = useState<Step>('banner')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  if (user.is_verified) return null

  const handleResend = async () => {
    setResendLoading(true)
    try {
      await authApi.resendCode()
      toast('Код надіслано на пошту', 'success')
      setStep('code')
      setError('')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Помилка', 'error')
    } finally {
      setResendLoading(false)
    }
  }

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Введіть 6-значний код'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.verifyEmail(code)
      const updated = await authApi.me()
      onVerified(updated)
      toast('Пошта підтверджена!', 'success')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Невірний код')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="verify-banner">
      <div className="verify-banner-icon">✉</div>

      {step === 'banner' ? (
        <>
          <div className="verify-banner-text">
            <span className="verify-banner-title">Підтвердьте email</span>
            <span className="verify-banner-sub">{user.email}</span>
          </div>
          <div className="verify-banner-actions">
            <button
              className="btn btn-sm verify-btn-confirm"
              onClick={handleResend}
              disabled={resendLoading}
            >
              {resendLoading ? <Spinner size={12} /> : null}
              Надіслати код
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="verify-banner-text">
            <span className="verify-banner-title">Введіть код з листа</span>
            <span className="verify-banner-sub">{user.email}</span>
          </div>
          <div className="verify-banner-actions">
            <input
              className="verify-code-input"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              autoFocus
            />
            <button
              className="btn btn-sm verify-btn-confirm"
              onClick={handleVerify}
              disabled={loading}
            >
              {loading ? <Spinner size={12} /> : null}
              Підтвердити
            </button>
            <button
              className="btn btn-sm verify-btn-resend"
              onClick={handleResend}
              disabled={resendLoading}
            >
              {resendLoading ? <Spinner size={12} /> : '↺'}
            </button>
          </div>
          {error && <div className="verify-banner-error">⚠ {error}</div>}
        </>
      )}
    </div>
  )
}
