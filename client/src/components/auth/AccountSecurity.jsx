import { useCallback, useEffect, useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'
import { Check, Copy, Fingerprint, KeyRound, Lock, Pencil, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'
import { Field, Notice, PasswordInput, inputClass, passkeysSupported, postJSON } from './AuthUI'

const btn = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50'
const btnPrimary = `${btn} bg-primary text-black hover:bg-primary-light`
const btnGhost = `${btn} border border-white/8 bg-white/4 text-white/70 hover:bg-white/8 hover:text-white`
const btnDanger = `${btn} border border-red-500/15 bg-red-500/8 text-red-400 hover:bg-red-500/15`

function Section({ icon: Icon, title, description, badge, children }) {
  return (
    <div className="border-t border-white/5 px-6 py-5 first:border-t-0">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">{title}</h3>
            {badge}
          </div>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-white/35">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Badge({ on, children }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${on ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/6 text-white/40'}`}>{children}</span>
  )
}

function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false)
  const text = codes.join('\n')
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Lux Client recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'lux-recovery-codes.txt'; a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
      <p className="text-xs font-semibold text-white/70">Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone or passkey. They are only shown now.</p>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-sm text-white">
        {codes.map((code) => <span key={code} className="rounded-lg bg-black/30 px-2.5 py-1.5 text-center">{code}</span>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={btnGhost}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}</button>
        <button type="button" onClick={download} className={btnGhost}>Download</button>
        <button type="button" onClick={onDone} className={btnPrimary}>I saved them</button>
      </div>
    </div>
  )
}

function PasswordSection({ security, reload }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '', code: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (form.newPassword !== form.confirm) return setMsg({ ok: false, text: 'The new passwords do not match.' })
    setBusy(true); setMsg(null)
    const r = await postJSON('/api/account/password', form)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: r.data.error || 'Could not save the password.' })
    setMsg({ ok: true, text: security.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password set. You can now also sign in with your email.' })
    setForm({ currentPassword: '', newPassword: '', confirm: '', code: '' })
    setOpen(false)
    reload()
  }

  return (
    <Section
      icon={Lock}
      title="Email and password"
      description={security.hasPassword
        ? `You sign in with ${security.email}.`
        : `No password yet. Set one to also sign in with ${security.email || 'your email'} instead of Google.`}
      badge={<Badge on={security.hasPassword}>{security.hasPassword ? 'On' : 'Off'}</Badge>}
    >
      {security.google && <p className="-mt-2 mb-3 text-xs text-white/35">Google sign-in is linked to this account.</p>}
      {msg && <div className="mb-3"><Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice></div>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={btnGhost} disabled={!security.email}>
          {security.hasPassword ? 'Change password' : 'Set a password'}
        </button>
      ) : (
        <form onSubmit={submit} className="grid gap-3 sm:max-w-md">
          {security.hasPassword && (
            <Field label="Current password">
              <PasswordInput value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} required />
            </Field>
          )}
          {!security.hasPassword && security.totpEnabled && (
            <Field label="Code from your authenticator app">
              <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} inputMode="numeric" className={inputClass} required />
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters">
            <PasswordInput value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="Repeat new password">
            <PasswordInput value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} autoComplete="new-password" required />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>Save</button>
            <button type="button" className={btnGhost} onClick={() => { setOpen(false); setMsg(null) }}>Cancel</button>
          </div>
        </form>
      )}
    </Section>
  )
}

// Asks for the password, or a 2FA code when the account has no password.
function ConfirmIdentity({ security, onConfirm, onCancel, label, busy }) {
  const [value, setValue] = useState('')
  const usesPassword = security.hasPassword
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(usesPassword ? { password: value } : { code: value }) }} className="flex flex-col gap-3 sm:max-w-md">
      <Field label={usesPassword ? 'Confirm with your password' : 'Confirm with a code from your authenticator app'}>
        {usesPassword
          ? <PasswordInput value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
          : <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" className={inputClass} required autoFocus />}
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={btnDanger} disabled={busy}>{label}</button>
        <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function TotpSection({ security, reload, onRecoveryCodes }) {
  const [setup, setSetup] = useState(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(null)

  const start = async () => {
    setBusy(true); setMsg(null)
    const r = await postJSON('/api/account/totp/setup')
    setBusy(false)
    if (r.ok) setSetup(r.data)
    else setMsg({ ok: false, text: r.data.error || 'Could not start the setup.' })
  }

  const enable = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const r = await postJSON('/api/account/totp/enable', { code })
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: r.data.error || 'That code is not valid.' })
    setSetup(null); setCode('')
    onRecoveryCodes(r.data.recoveryCodes)
    reload()
  }

  const confirmed = async (proof) => {
    setBusy(true); setMsg(null)
    const url = confirming === 'disable' ? '/api/account/totp/disable' : '/api/account/recovery-codes'
    const r = await postJSON(url, proof)
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: r.data.error || 'Could not confirm.' })
    if (r.data.recoveryCodes) onRecoveryCodes(r.data.recoveryCodes)
    setConfirming(null)
    reload()
  }

  return (
    <Section
      icon={Smartphone}
      title="Authenticator app (2FA)"
      description="After your password, also ask for a 6-digit code from an app like Google Authenticator, Aegis, 1Password or Authy. Also applies to Google sign-in."
      badge={<Badge on={security.totpEnabled}>{security.totpEnabled ? 'On' : 'Off'}</Badge>}
    >
      {msg && <div className="mb-3"><Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice></div>}

      {security.totpEnabled && !confirming && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnGhost} onClick={() => setConfirming('codes')}>New recovery codes</button>
          <button type="button" className={btnDanger} onClick={() => setConfirming('disable')}>Turn off</button>
          <span className="text-xs text-white/30">{security.recoveryCodesLeft} recovery code{security.recoveryCodesLeft === 1 ? '' : 's'} left</span>
        </div>
      )}
      {confirming && (
        <ConfirmIdentity
          security={security}
          busy={busy}
          label={confirming === 'disable' ? 'Turn off 2FA' : 'Create new codes'}
          onConfirm={confirmed}
          onCancel={() => { setConfirming(null); setMsg(null) }}
        />
      )}

      {!security.totpEnabled && !setup && (
        <button type="button" onClick={start} className={btnPrimary} disabled={busy}>Set up</button>
      )}

      {setup && (
        <form onSubmit={enable} className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44 shrink-0 rounded-xl bg-white p-2" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <p className="text-xs leading-relaxed text-white/50">1. Scan the QR code with your authenticator app, or enter this key by hand:</p>
            <code className="break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-white/80">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            <Field label="2. Enter the 6-digit code the app shows">
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" className={`${inputClass} font-mono tracking-[0.3em]`} required autoFocus />
            </Field>
            <div className="flex gap-2">
              <button type="submit" className={btnPrimary} disabled={busy}>Turn on</button>
              <button type="button" className={btnGhost} onClick={() => { setSetup(null); setMsg(null) }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
    </Section>
  )
}

function PasskeyRow({ passkey, reload, onError }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(passkey.name)
  const save = async (e) => {
    e.preventDefault()
    const r = await postJSON(`/api/account/passkeys/${passkey.id}`, { name }, 'PATCH')
    if (!r.ok) return onError(r.data.error)
    setEditing(false); reload()
  }
  const remove = async () => {
    if (!window.confirm(`Remove the passkey "${passkey.name}"?`)) return
    const r = await postJSON(`/api/account/passkeys/${passkey.id}`, {}, 'DELETE')
    if (!r.ok) return onError(r.data.error)
    reload()
  }
  const date = (v) => (v ? new Date(v).toLocaleDateString() : null)
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3">
      <Fingerprint className="h-4 w-4 shrink-0 text-white/40" />
      {editing ? (
        <form onSubmit={save} className="flex min-w-0 flex-1 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${inputClass} py-1.5`} autoFocus />
          <button type="submit" className={btnPrimary}>Save</button>
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/80">{passkey.name}</p>
          <p className="text-[11px] text-white/30">Added {date(passkey.createdAt)}{passkey.lastUsedAt ? ` · last used ${date(passkey.lastUsedAt)}` : ''}</p>
        </div>
      )}
      {!editing && (
        <div className="flex gap-1">
          <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-2 text-white/35 hover:bg-white/6 hover:text-white" aria-label="Rename"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={remove} className="rounded-lg p-2 text-white/35 hover:bg-red-500/10 hover:text-red-400" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </li>
  )
}

function guessDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Passkey'
}

function PasskeySection({ security, reload, onRecoveryCodes }) {
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const supported = passkeysSupported()

  const add = async () => {
    setBusy(true); setMsg(null)
    const options = await postJSON('/api/account/passkeys/options')
    if (!options.ok) { setBusy(false); return setMsg({ ok: false, text: options.data.error || 'Could not start.' }) }
    let response
    try {
      response = await startRegistration({ optionsJSON: options.data })
    } catch (err) {
      setBusy(false)
      if (err?.name === 'InvalidStateError') return setMsg({ ok: false, text: 'This device already has a passkey for your account.' })
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return undefined
      return setMsg({ ok: false, text: 'Your browser could not create a passkey.' })
    }
    const r = await postJSON('/api/account/passkeys/verify', { response, name: guessDeviceName() })
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: r.data.error || 'The passkey could not be saved.' })
    setMsg({ ok: true, text: 'Passkey added. You can now sign in with it, without a password.' })
    if (r.data.recoveryCodes) onRecoveryCodes(r.data.recoveryCodes)
    reload()
  }

  return (
    <Section
      icon={KeyRound}
      title="Passkeys"
      description="Sign in with your fingerprint, face or device PIN instead of a password. Passkeys can't be phished and also count as your second factor."
      badge={<Badge on={security.passkeys.length > 0}>{security.passkeys.length ? `${security.passkeys.length} added` : 'None'}</Badge>}
    >
      {msg && <div className="mb-3"><Notice tone={msg.ok ? 'success' : 'error'}>{msg.text}</Notice></div>}
      {security.passkeys.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {security.passkeys.map((p) => <PasskeyRow key={p.id} passkey={p} reload={reload} onError={(t) => setMsg({ ok: false, text: t || 'Something went wrong.' })} />)}
        </ul>
      )}
      {supported
        ? <button type="button" onClick={add} className={btnPrimary} disabled={busy}>Add a passkey</button>
        : <p className="text-xs text-white/35">This browser does not support passkeys.</p>}
    </Section>
  )
}

export default function AccountSecurity() {
  const [security, setSecurity] = useState(null)
  const [error, setError] = useState('')
  const [codes, setCodes] = useState(null)

  const reload = useCallback(() => {
    fetch('/api/account/security', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setSecurity)
      .catch(() => setError('Could not load your security settings.'))
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]" id="security">
      <div className="flex items-center gap-2 border-b border-white/5 px-6 py-5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-base font-bold text-white">Sign-in and security</h2>
          <p className="mt-0.5 text-xs text-white/30">Password, two-factor authentication and passkeys</p>
        </div>
      </div>
      {codes && <div className="px-6 pt-5"><RecoveryCodes codes={codes} onDone={() => setCodes(null)} /></div>}
      {error && <div className="p-6"><Notice>{error}</Notice></div>}
      {!security && !error && <div className="m-6 h-40 animate-pulse rounded-xl bg-white/4" />}
      {security && (
        <>
          <PasswordSection security={security} reload={reload} />
          <TotpSection security={security} reload={reload} onRecoveryCodes={setCodes} />
          <PasskeySection security={security} reload={reload} onRecoveryCodes={setCodes} />
        </>
      )}
    </div>
  )
}
