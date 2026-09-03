import { AlertTriangle, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Field, TextInput } from './ui'

/* Sign-in gate. Two routes in — master password or an admin Google account —
   so both are presented as equals instead of one being an afterthought. */

export default function LockScreen({ password, onPasswordChange, onSubmit, error, loggedIn, loginUrl, busy }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-5 py-16">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-[120px]" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />

      <div className="relative w-full max-w-[400px]">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-white/30 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to lux client
        </Link>

        <div className="mb-7 flex flex-col items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Admin panel</h1>
            <p className="mt-1 text-sm leading-relaxed text-white/40">
              Restricted area. Unlock with the master password, or sign in with an account that has admin rights.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-[#0f0f0f] p-6">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Master password">
              <TextInput
                type="password"
                autoFocus
                value={password}
                onChange={onPasswordChange}
                placeholder="••••••••••••"
              />
            </Field>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] px-3.5 py-2.5 text-xs font-semibold text-red-400">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" variant="primary" icon={KeyRound} disabled={busy || !password} className="w-full">
              {busy ? 'Checking…' : 'Unlock panel'}
            </Button>
          </form>

          {!loggedIn && (
            <>
              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/[0.07]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/20">or</span>
                <span className="h-px flex-1 bg-white/[0.07]" />
              </div>
              <a
                href={loginUrl}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-sm font-bold text-white/80 transition-all hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white active:scale-[0.97]"
              >
                Sign in with Google
              </a>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-white/20">
          Every action taken in here is written to the audit log.
        </p>
      </div>
    </div>
  )
}
