import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2 } from 'lucide-react'
import PageShell from '../PageShell'

export async function postJSON(url, body = {}, method = 'POST') {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// Only same-site paths, same rule as the server.
export function safeReturnTo(value, fallback = '/dashboard') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}

export function useAuthConfig() {
  const [config, setConfig] = useState(null)
  useEffect(() => {
    let active = true
    fetch('/api/auth/config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (active) setConfig(data || { google: true, registrationOpen: false, emailAvailable: false }) })
      .catch(() => { if (active) setConfig({ google: true, registrationOpen: false, emailAvailable: false }) })
    return () => { active = false }
  }, [])
  return config
}

export function formatResume(config) {
  if (!config?.emailResumesAt) return null
  const date = new Date(config.emailResumesAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function AuthLayout({ eyebrow, title, subtitle, children, footer }) {
  return (
    <PageShell>
      <main className="relative flex min-h-[calc(100vh-4rem)] items-start justify-center px-4 pb-24 pt-28 sm:pt-32">
        <div className="pointer-events-none absolute left-1/2 top-16 h-[320px] w-[min(640px,100%)] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-[110px]" />
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[420px]"
        >
          <div className="mb-7 text-center">
            <img src="/resources/lux_icon.png?v=3" alt="" className="mx-auto mb-5 h-11 w-11" />
            {eyebrow && <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary/80">{eyebrow}</p>}
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-white/40">{subtitle}</p>}
          </div>
          <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-6 shadow-2xl shadow-black/40 sm:p-7">
            {children}
          </div>
          {footer && <div className="mt-6 text-center text-sm text-white/40">{footer}</div>}
        </motion.div>
      </main>
    </PageShell>
  )
}

export const inputClass = 'w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:opacity-50'

export function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-white/50">{label}</span>
        {hint && <span className="text-[11px] text-white/30">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  )
}

export function PasswordInput({ value, onChange, autoComplete = 'current-password', ...rest }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className={`${inputClass} pr-10`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-white/30 transition hover:text-white/70"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function PrimaryButton({ busy, children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function SecondaryButton({ busy, children, className = '', as: As = 'button', ...rest }) {
  return (
    <As
      {...rest}
      disabled={As === 'button' ? (busy || rest.disabled) : undefined}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/4 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/15 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </As>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.07-1.1-.16-1.6H12z" />
    </svg>
  )
}

export function GoogleButton({ returnTo, label = 'Continue with Google' }) {
  const href = `/auth/google${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
  return (
    <SecondaryButton as="a" href={href}>
      <GoogleMark /> {label}
    </SecondaryButton>
  )
}

export function Divider({ label = 'or' }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-white/[0.07]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">{label}</span>
      <span className="h-px flex-1 bg-white/[0.07]" />
    </div>
  )
}

export function Notice({ tone = 'error', children }) {
  const styles = {
    error: 'border-red-500/15 bg-red-500/8 text-red-300',
    success: 'border-emerald-500/15 bg-emerald-500/8 text-emerald-300',
    info: 'border-primary/15 bg-primary/8 text-primary-light',
  }
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium leading-relaxed ${styles[tone]}`}>
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function passkeysSupported() {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'
}
