import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react'
import {
  AuthLayout, Field, Notice, PasswordInput, PrimaryButton, SecondaryButton,
  formatResume, inputClass, postJSON, useAuthConfig,
} from '../components/auth/AuthUI'

const backToLogin = <Link to="/login" className="font-semibold text-primary hover:text-primary-light">Back to sign in</Link>

export function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [state, setState] = useState({ status: 'working', error: '' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!token) { setState({ status: 'error', error: 'This confirmation link is incomplete.' }); return }
    postJSON('/api/auth/verify-email', { token }).then((r) => {
      if (!r.ok) return setState({ status: 'error', error: r.data.error || 'This confirmation link is invalid or has expired.' })
      setState({ status: 'done', error: '' })
      setTimeout(() => {
        window.location.href = r.data.twoFactor ? '/login?step=2fa' : (r.data.returnTo || '/dashboard')
      }, 1400)
    })
  }, [token])

  return (
    <AuthLayout eyebrow="Lux account" title="Confirm your email" footer={state.status === 'error' ? backToLogin : null}>
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {state.status === 'working' && <><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm text-white/50">Confirming…</p></>}
        {state.status === 'done' && (
          <>
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-sm font-bold text-white">Your email is confirmed.</p>
            <p className="text-xs text-white/40">Signing you in…</p>
          </>
        )}
        {state.status === 'error' && (
          <>
            <XCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-white/60">{state.error}</p>
            <p className="text-xs text-white/35">Try signing in: you can ask for a new link there.</p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

export function ForgotPassword() {
  const config = useAuthConfig()
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const r = await postJSON('/api/auth/forgot-password', { email: address })
    setBusy(false)
    if (r.ok) return setSent(true)
    setError(r.data.error || 'Could not send the email.')
  }

  if (sent) {
    return (
      <AuthLayout eyebrow="Password reset" title="Check your inbox" footer={backToLogin}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MailCheck className="h-5 w-5" /></span>
          <p className="text-sm leading-relaxed text-white/60">
            If <span className="font-semibold text-white">{address}</span> belongs to a Lux account, a reset link is on its way. It is valid for 1 hour.
          </p>
          <p className="text-xs text-white/30">Nothing there after a few minutes? Check your spam folder.</p>
        </div>
      </AuthLayout>
    )
  }

  const unavailable = config && !config.emailAvailable
  const when = formatResume(config)

  return (
    <AuthLayout
      eyebrow="Password reset"
      title="Forgot your password?"
      subtitle="Enter the email of your account and we'll send you a link to choose a new password."
      footer={backToLogin}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {unavailable && (
          <Notice>
            Due to a server problem we can't send emails right now.
            {config.emailReason === 'monthly' ? ' Please try again after the monthly email limit resets' : ' Please try again tomorrow'}
            {when ? ` (${when}).` : '.'}
          </Notice>
        )}
        <Field label="Email">
          <input type="email" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="email" className={inputClass} placeholder="you@example.com" required />
        </Field>
        {error && <Notice>{error}</Notice>}
        <PrimaryButton type="submit" busy={busy}>Send reset link</PrimaryButton>
        <p className="text-center text-[11px] leading-relaxed text-white/30">
          Signed up with Google? This also lets you add a password to that account.
        </p>
      </form>
    </AuthLayout>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [valid, setValid] = useState(null)
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setValid(false); return }
    fetch(`/api/auth/reset-password/check?token=${encodeURIComponent(token)}`)
      .then((r) => r.json()).then((d) => setValid(Boolean(d.valid))).catch(() => setValid(false))
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) return setError('The passwords do not match.')
    setBusy(true); setError('')
    const r = await postJSON('/api/auth/reset-password', { token, password: form.password })
    setBusy(false)
    if (r.ok) return setDone(true)
    setError(r.data.error || 'Could not change the password.')
  }

  if (done) {
    return (
      <AuthLayout eyebrow="Password reset" title="Password changed">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm text-white/60">Your new password is set and other devices were signed out. Sign in with it now.</p>
          <PrimaryButton type="button" onClick={() => navigate('/login')}>Sign in</PrimaryButton>
        </div>
      </AuthLayout>
    )
  }

  if (valid === false) {
    return (
      <AuthLayout eyebrow="Password reset" title="Link expired" footer={backToLogin}>
        <div className="flex flex-col items-center gap-4 text-center">
          <XCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-white/60">This reset link is invalid, was already used or has expired.</p>
          <SecondaryButton as={Link} to="/forgot-password">Request a new link</SecondaryButton>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout eyebrow="Password reset" title="Choose a new password" footer={backToLogin}>
      {valid === null ? (
        <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="New password" hint="At least 8 characters">
            <PasswordInput value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" required minLength={8} maxLength={200} autoFocus />
          </Field>
          <Field label="Repeat new password">
            <PasswordInput value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" required />
          </Field>
          {error && <Notice>{error}</Notice>}
          <PrimaryButton type="submit" busy={busy}>Save new password</PrimaryButton>
        </form>
      )}
    </AuthLayout>
  )
}
