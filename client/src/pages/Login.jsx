import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import { Fingerprint, KeyRound, ShieldCheck } from 'lucide-react'
import {
  AuthLayout, Divider, Field, GoogleButton, Notice, PasswordInput, PrimaryButton, SecondaryButton,
  inputClass, passkeysSupported, postJSON, safeReturnTo, useAuthConfig,
} from '../components/auth/AuthUI'

const URL_ERRORS = {
  no_user: 'Google sign-in did not work. If your account is banned, you cannot sign in.',
  server: 'Something went wrong on our side. Please try again.',
}

async function passkeyLogin(returnTo) {
  const options = await postJSON('/api/auth/passkey/options', { returnTo })
  if (!options.ok) return { ok: false, error: options.data.error || 'Passkeys are not available right now.' }
  let response
  try {
    response = await startAuthentication({ optionsJSON: options.data })
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return { ok: false, cancelled: true }
    return { ok: false, error: 'Your browser could not use a passkey.' }
  }
  const verify = await postJSON('/api/auth/passkey/verify', { response })
  if (!verify.ok) return { ok: false, error: verify.data.error || 'The passkey could not be verified.' }
  return { ok: true, returnTo: verify.data.returnTo }
}

function SecondFactor({ methods, onCancel }) {
  const [mode, setMode] = useState(methods.includes('totp') ? 'totp' : methods.includes('passkey') ? 'passkey' : 'recovery')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const done = (returnTo) => { window.location.href = safeReturnTo(returnTo) }

  const submitCode = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const body = mode === 'recovery' ? { recoveryCode: code } : { code }
    const r = await postJSON('/api/auth/login/2fa', body)
    setBusy(false)
    if (r.ok) return done(r.data.returnTo)
    if (r.data.code === 'no_pending_login') return onCancel(r.data.error)
    setError(r.data.error || 'That code is not valid.')
    setCode('')
  }

  const usePasskey = async () => {
    setBusy(true); setError('')
    const r = await passkeyLogin()
    setBusy(false)
    if (r.ok) return done(r.returnTo)
    if (!r.cancelled) setError(r.error)
  }

  const cancel = async () => {
    await postJSON('/api/auth/login/cancel')
    onCancel()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-white/50">Your account is protected with two-factor authentication. Confirm it's you to finish signing in.</p>
      </div>

      {mode === 'passkey' ? (
        <PrimaryButton type="button" busy={busy} onClick={usePasskey}>
          <Fingerprint className="h-4 w-4" /> Use your passkey
        </PrimaryButton>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-4">
          <Field label={mode === 'recovery' ? 'Recovery code' : 'Code from your authenticator app'}>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode={mode === 'recovery' ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder={mode === 'recovery' ? 'xxxx-xxxx' : '123456'}
              maxLength={mode === 'recovery' ? 12 : 7}
              className={`${inputClass} text-center font-mono text-lg tracking-[0.35em]`}
            />
          </Field>
          {error && <Notice>{error}</Notice>}
          <PrimaryButton type="submit" busy={busy} disabled={!code.trim()}>Verify</PrimaryButton>
        </form>
      )}
      {mode === 'passkey' && error && <Notice>{error}</Notice>}

      <div className="flex flex-col gap-1.5 pt-1 text-center text-xs">
        {mode !== 'totp' && methods.includes('totp') && (
          <button type="button" onClick={() => { setMode('totp'); setError('') }} className="text-white/45 hover:text-white">Use your authenticator app</button>
        )}
        {mode !== 'passkey' && methods.includes('passkey') && passkeysSupported() && (
          <button type="button" onClick={() => { setMode('passkey'); setError('') }} className="text-white/45 hover:text-white">Use a passkey instead</button>
        )}
        {mode !== 'recovery' && methods.includes('recovery') && (
          <button type="button" onClick={() => { setMode('recovery'); setError(''); setCode('') }} className="text-white/45 hover:text-white">Use a recovery code</button>
        )}
        <button type="button" onClick={cancel} className="mt-2 text-white/30 hover:text-white/60">Cancel and start over</button>
      </div>
    </div>
  )
}

export default function Login() {
  const [params] = useSearchParams()
  const config = useAuthConfig()
  const returnTo = safeReturnTo(params.get('returnTo'), '/dashboard')

  const [form, setForm] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(URL_ERRORS[params.get('error')] || '')
  const [unverified, setUnverified] = useState(false)
  const [resent, setResent] = useState('')
  const [methods, setMethods] = useState(null)

  // Coming back from Google with 2FA, or a reload in the middle of the second step.
  useEffect(() => {
    if (config?.pending2fa) setMethods(config.pending2fa.methods)
  }, [config])

  // Already signed in? Go on.
  useEffect(() => {
    fetch('/api/user', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d.loggedIn) window.location.replace(returnTo) })
      .catch(() => {})
  }, [returnTo])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setUnverified(false); setResent('')
    const r = await postJSON('/api/auth/login', { ...form, returnTo })
    setBusy(false)
    if (r.ok && r.data.twoFactor) return setMethods(r.data.methods)
    if (r.ok) { window.location.href = safeReturnTo(r.data.returnTo); return }
    if (r.data.code === 'email_unverified') setUnverified(true)
    setError(r.data.error || 'Sign-in failed.')
  }

  const resend = async () => {
    const r = await postJSON('/api/auth/resend-verification', { email: form.email })
    setResent(r.ok ? 'If the address belongs to an unconfirmed account, a new link is on its way.' : (r.data.error || 'Could not send the email.'))
  }

  const passkey = async () => {
    setBusy(true); setError('')
    const r = await passkeyLogin(returnTo)
    setBusy(false)
    if (r.ok) { window.location.href = safeReturnTo(r.returnTo); return }
    if (!r.cancelled) setError(r.error)
  }

  if (methods) {
    return (
      <AuthLayout eyebrow="Lux account" title="Two-factor check">
        <SecondFactor methods={methods} onCancel={(msg) => { setMethods(null); if (msg) setError(msg) }} />
      </AuthLayout>
    )
  }

  const registerHref = `/register${params.get('returnTo') ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`

  return (
    <AuthLayout
      eyebrow="Lux account"
      title="Welcome back"
      subtitle="Sign in to sync your instances, publish extensions and use your cosmetics."
      footer={<>New to Lux? <Link to={registerHref} className="font-semibold text-primary hover:text-primary-light">Create an account</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email">
          <input
            type="email"
            autoComplete="username webauthn"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputClass}
            placeholder="you@example.com"
            required
          />
        </Field>
        <Field label="Password" hint={<Link to="/forgot-password" className="text-white/40 hover:text-primary">Forgot password?</Link>}>
          <PasswordInput value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
        </Field>

        {error && (
          <Notice>
            {error}
            {unverified && (
              <button type="button" onClick={resend} className="mt-1.5 block font-semibold underline underline-offset-2">Send the confirmation email again</button>
            )}
          </Notice>
        )}
        {resent && <Notice tone="info">{resent}</Notice>}

        <PrimaryButton type="submit" busy={busy}>Sign in</PrimaryButton>
      </form>

      <Divider />

      <div className="flex flex-col gap-2.5">
        {passkeysSupported() && (
          <SecondaryButton type="button" onClick={passkey} disabled={busy}>
            <KeyRound className="h-4 w-4" /> Sign in with a passkey
          </SecondaryButton>
        )}
        {(config?.google ?? true) && <GoogleButton returnTo={returnTo} />}
      </div>
    </AuthLayout>
  )
}
