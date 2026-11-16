import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck, MailX } from 'lucide-react'
import {
  AuthLayout, Divider, Field, GoogleButton, Notice, PasswordInput, PrimaryButton,
  formatResume, inputClass, postJSON, safeReturnTo, useAuthConfig,
} from '../components/auth/AuthUI'

function strength(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(4, score)
}

const STRENGTH = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']
const STRENGTH_COLOR = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-400']

export function EmailClosedNotice({ config }) {
  const when = formatResume(config)
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400"><MailX className="h-5 w-5" /></span>
      <p className="text-sm font-bold text-white">Sign-up with email is paused</p>
      <p className="text-xs leading-relaxed text-white/45">
        Due to a server problem we can't send emails right now, so new email accounts can't be confirmed.
        {config?.emailReason === 'monthly' ? ' This lasts until the monthly email limit resets' : ' Please try again tomorrow'}
        {when ? ` (${when}).` : '.'} You can still sign up with Google.
      </p>
    </div>
  )
}

export default function Register() {
  const [params] = useSearchParams()
  const config = useAuthConfig()
  const returnTo = safeReturnTo(params.get('returnTo'), '/dashboard')

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState({ text: '', field: null, code: null })
  const [sentTo, setSentTo] = useState(null)
  const [resent, setResent] = useState('')

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const score = strength(form.password)

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) return setError({ text: 'The passwords do not match.', field: 'confirm' })
    setBusy(true); setError({ text: '', field: null })
    const r = await postJSON('/api/auth/register', { username: form.username, email: form.email, password: form.password })
    setBusy(false)
    if (r.ok) return setSentTo(form.email.trim())
    if (r.data.code === 'email_google' || r.data.code === 'email_taken') {
      return setError({ text: r.data.error, field: null, code: r.data.code })
    }
    setError({ text: r.data.error || 'Registration failed.', field: r.data.field || null, code: r.data.code || null })
  }

  const resend = async () => {
    const r = await postJSON('/api/auth/resend-verification', { email: sentTo })
    setResent(r.ok ? 'A new link is on its way.' : (r.data.error || 'Could not send the email.'))
  }

  const loginHref = `/login${params.get('returnTo') ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
  const footer = <>Already have an account? <Link to={loginHref} className="font-semibold text-primary hover:text-primary-light">Sign in</Link></>

  if (sentTo) {
    return (
      <AuthLayout eyebrow="Almost done" title="Check your inbox" footer={footer}>
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MailCheck className="h-5 w-5" /></span>
          <p className="text-sm leading-relaxed text-white/60">
            We sent a confirmation link to <span className="font-semibold text-white">{sentTo}</span>. Open it to activate your account. The link is valid for 24 hours.
          </p>
          <p className="text-xs text-white/30">Nothing there? Check your spam folder.</p>
          <button type="button" onClick={resend} className="text-xs font-semibold text-primary hover:text-primary-light">Send the link again</button>
          {resent && <Notice tone="info">{resent}</Notice>}
        </div>
      </AuthLayout>
    )
  }

  const closed = config && !config.registrationOpen

  return (
    <AuthLayout
      eyebrow="Lux account"
      title="Create your account"
      subtitle="One account for Lux Cloud, cosmetics, capes and the extension marketplace."
      footer={footer}
    >
      {(config?.google ?? true) && (
        <>
          <GoogleButton returnTo={returnTo} label="Sign up with Google" />
          <Divider label="or with email" />
        </>
      )}

      {closed ? (
        <EmailClosedNotice config={config} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Username" hint="3–32 characters" error={error.field === 'username' ? error.text : null}>
            <input value={form.username} onChange={set('username')} autoComplete="username" className={inputClass} placeholder="Steve" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_.\-]+" />
          </Field>
          <Field label="Email" error={error.field === 'email' ? error.text : null}>
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" className={inputClass} placeholder="you@example.com" required maxLength={100} />
          </Field>
          <Field label="Password" hint="At least 8 characters" error={error.field === 'password' ? error.text : null}>
            <PasswordInput value={form.password} onChange={set('password')} autoComplete="new-password" required minLength={8} maxLength={200} />
            {form.password && (
              <div className="mt-1 flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? STRENGTH_COLOR[score] : 'bg-white/8'}`} />
                  ))}
                </div>
                <span className="w-16 text-right text-[11px] text-white/40">{STRENGTH[score]}</span>
              </div>
            )}
          </Field>
          <Field label="Repeat password" error={error.field === 'confirm' ? error.text : null}>
            <PasswordInput value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-white/45">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 accent-[#e27602]" required />
            <span>I have read the <Link to="/privacy" className="text-primary hover:text-primary-light">privacy policy</Link>.</span>
          </label>

          {error.code === 'email_google' && (
            <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
              <p className="text-xs font-semibold leading-relaxed text-white/80">
                You already have a Lux account with this email address, connected to Google. Please sign in with Google instead.
              </p>
              <GoogleButton returnTo={returnTo} label="Sign in with Google" />
            </div>
          )}
          {error.code === 'email_taken' && (
            <Notice>
              {error.text}{' '}
              <Link to={loginHref} className="font-semibold underline underline-offset-2">Sign in</Link>
              {' · '}
              <Link to="/forgot-password" className="font-semibold underline underline-offset-2">Reset password</Link>
            </Notice>
          )}
          {error.text && !['email_google', 'email_taken'].includes(error.code) && !['username', 'email', 'password', 'confirm'].includes(error.field) && <Notice>{error.text}</Notice>}

          <PrimaryButton type="submit" busy={busy} disabled={!config}>Create account</PrimaryButton>
        </form>
      )}
    </AuthLayout>
  )
}
