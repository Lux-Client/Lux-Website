import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { Button, Field, Modal, TextInput } from './ui'
import { cn } from '../../lib/utils'

/* Toasts and promise-based dialogs.
   The panel used to lean on window.confirm/window.prompt for bans, quotas and
   deletions, which meant native popups, no context and no feedback once the
   request went through. These give every action a visible outcome instead. */

// ─── Toasts ──────────────────────────────────────────────────────────────────

const ToastContext = createContext(null)

const TOAST_STYLES = {
  success: { icon: CheckCircle2,   ring: 'border-emerald-500/25', accent: 'text-emerald-400' },
  error:   { icon: XCircle,        ring: 'border-red-500/25',     accent: 'text-red-400' },
  warning: { icon: AlertTriangle,  ring: 'border-amber-500/25',   accent: 'text-amber-400' },
  info:    { icon: Info,           ring: 'border-white/[0.12]',   accent: 'text-white/70' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), [])

  const push = useCallback((type, message, detail) => {
    const id = ++nextId.current
    setToasts(list => [...list, { id, type, message, detail }])
    setTimeout(() => dismiss(id), 5000)
  }, [dismiss])

  const api = useMemo(() => ({
    success: (message, detail) => push('success', message, detail),
    error:   (message, detail) => push('error',   message, detail),
    warning: (message, detail) => push('warning', message, detail),
    info:    (message, detail) => push('info',    message, detail),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[300] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2">
        {toasts.map(toast => {
          const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info
          const Icon = style.icon
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border bg-[#131313]/95 p-3.5 shadow-2xl backdrop-blur',
                style.ring,
              )}
            >
              <Icon className={cn('mt-px h-4 w-4 shrink-0', style.accent)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white">{toast.message}</p>
                {toast.detail && <p className="mt-1 break-words text-[11px] leading-relaxed text-white/40">{toast.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-md p-0.5 text-white/25 transition-colors hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

const DialogContext = createContext(null)

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [values, setValues] = useState({})

  const open = useCallback((kind, options) => new Promise(resolve => {
    setValues(Object.fromEntries((options.fields || []).map(f => [f.name, f.defaultValue ?? ''])))
    setDialog({ kind, options, resolve })
  }), [])

  const api = useMemo(() => ({
    /* Resolves true / false. */
    confirm: options => open('confirm', options),
    /* Resolves an object of field values, or null when cancelled. */
    prompt:  options => open('prompt', options),
  }), [open])

  const close = result => {
    dialog?.resolve(result)
    setDialog(null)
  }

  const options = dialog?.options || {}
  const fields = options.fields || []
  const missingRequired = fields.some(f => f.required && !String(values[f.name] ?? '').trim())

  const submit = () => {
    if (dialog.kind === 'confirm') return close(true)
    if (missingRequired) return
    close({ ...values })
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        open={!!dialog}
        onClose={() => close(dialog?.kind === 'confirm' ? false : null)}
        title={options.title || ''}
        description={options.description}
        footer={(
          <>
            <Button size="lg" variant="ghost" onClick={() => close(dialog?.kind === 'confirm' ? false : null)}>
              {options.cancelLabel || 'Cancel'}
            </Button>
            <Button
              size="lg"
              variant={options.tone === 'danger' ? 'solid' : 'primary'}
              disabled={missingRequired}
              onClick={submit}
            >
              {options.confirmLabel || 'Confirm'}
            </Button>
          </>
        )}
      >
        {fields.length > 0 && (
          <form
            onSubmit={e => { e.preventDefault(); submit() }}
            className="flex flex-col gap-4"
          >
            {fields.map(field => (
              <Field key={field.name} label={field.label} hint={field.hint}>
                <TextInput
                  autoFocus={field === fields[0]}
                  type={field.type || 'text'}
                  placeholder={field.placeholder}
                  value={values[field.name] ?? ''}
                  onChange={v => setValues(cur => ({ ...cur, [field.name]: v }))}
                />
              </Field>
            ))}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Modal>
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}
