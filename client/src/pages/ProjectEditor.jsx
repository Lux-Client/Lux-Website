import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Upload, FileText, Tag, AlertTriangle, CheckCircle2,
  Clock, XCircle, ChevronLeft, Trash2, User, Puzzle, Palette,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'
import useAuth from '../hooks/useAuth'

const STATUS = {
  approved:        { label: 'Approved',        bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle2 },
  pending:         { label: 'Pending',          bg: 'bg-amber-500/10',   text: 'text-amber-400',   icon: Clock        },
  rejected:        { label: 'Rejected',         bg: 'bg-red-500/10',     text: 'text-red-400',     icon: XCircle      },
  action_required: { label: 'Action Required',  bg: 'bg-blue-500/10',    text: 'text-blue-400',    icon: AlertTriangle},
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${s.bg} ${s.text}`}>
      <Icon className="h-2.5 w-2.5" />
      {s.label}
    </span>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-white/40">{label}</span>
        {hint && <span className="text-[10px] text-white/20">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputClass = 'w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-primary/50 focus:ring-1 focus:ring-primary/20'
const fileClass  = `${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-black file:cursor-pointer cursor-pointer`

const emptyForm = { name: '', identifier: '', summary: '', description: '', visibility: 'public', version: '1.0.0', category: '', mcVersion: '' }
const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

// type: 'extension' | 'theme' — fixed for create mode, derived from loaded project for edit mode
export default function ProjectEditor({ type: fixedType }) {
  const auth     = useAuth()
  const navigate = useNavigate()
  const { id }   = useParams()
  const isEdit   = !!id

  const [loading,     setLoading]     = useState(isEdit)
  const [notFound,    setNotFound]    = useState(false)
  const [project,     setProject]     = useState(null)
  const [form,        setForm]        = useState(emptyForm)
  const [bannerFile,  setBannerFile]  = useState(null)
  const [projectFile, setProjectFile] = useState(null)
  const [msg,         setMsg]         = useState({ text: '', ok: true })
  const [submitting,  setSubmitting]  = useState(false)

  const [tab, setTab]                 = useState('meta')
  const [versions,     setVersions]     = useState([])
  const [versionForm,  setVersionForm]  = useState({ version: '', changelog: '' })
  const [versionFile,  setVersionFile]  = useState(null)
  const [filterOptions, setFilterOptions] = useState({ categories: [], mcVersions: [] })

  const type = isEdit ? (project?.type || 'extension') : fixedType

  useEffect(() => {
    fetch('/api/meta/filters')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFilterOptions(d) })
      .catch(() => {})
  }, [])

  // Load project for edit mode, verify ownership
  useEffect(() => {
    if (!isEdit || !auth.loggedIn) return
    setLoading(true)
    fetch('/api/user/extensions')
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        const hit = Array.isArray(list) ? list.find(p => String(p.id) === String(id)) : null
        if (!hit) { setNotFound(true); return }
        setProject(hit)
        setForm({
          name:        hit.name        || '',
          identifier:  hit.identifier  || '',
          summary:     hit.summary     || '',
          description: hit.description || '',
          visibility:  hit.visibility  || 'public',
          version:     '1.0.0',
          category:    hit.category    || '',
          mcVersion:   hit.mc_version  || '',
        })
      })
      .finally(() => setLoading(false))
  }, [isEdit, id, auth.loggedIn])

  // Load versions once project is known
  useEffect(() => {
    if (!project) return
    fetch(`/api/extensions/${project.id}/versions`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setVersions(Array.isArray(d) ? d : []))
  }, [project])

  const handleMetaSubmit = async e => {
    e.preventDefault()
    setSubmitting(true)
    setMsg({ text: '', ok: true })
    try {
      const fd = new FormData()
      fd.append('name',        form.name)
      fd.append('identifier',  form.identifier)
      fd.append('summary',     form.summary)
      fd.append('description', form.description)
      fd.append('type',        type)
      fd.append('visibility',  form.visibility)
      fd.append('category',    form.category)
      fd.append('mcVersion',   form.mcVersion)
      if (!isEdit) fd.append('version', form.version)
      if (bannerFile)  fd.append('bannerImage',   bannerFile)
      if (projectFile) fd.append('extensionFile', projectFile)

      const endpoint = isEdit ? `/api/extensions/update/${id}` : '/api/extensions/upload'
      const res  = await fetch(endpoint, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setMsg({ text: data.error || 'Submission failed.', ok: false })
      } else if (isEdit) {
        setMsg({ text: 'Project updated!', ok: true })
      } else {
        navigate(`/extensions/${data.extensionId}/edit`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleVersionSubmit = async e => {
    e.preventDefault()
    if (!project || !versionFile) return
    const fd = new FormData()
    fd.append('extensionFile', versionFile)
    fd.append('version',   versionForm.version)
    fd.append('changelog', versionForm.changelog)
    const res  = await fetch(`/api/extensions/${project.id}/version`, { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) {
      setMsg({ text: 'Version submitted for review!', ok: true })
      setVersionForm({ version: '', changelog: '' }); setVersionFile(null)
      const vr = await fetch(`/api/extensions/${project.id}/versions`)
      setVersions(vr.ok ? (await vr.json().catch(() => [])) : [])
    } else {
      setMsg({ text: data.error || 'Version upload failed.', ok: false })
    }
  }

  const deleteVersion = async versionId => {
    if (!window.confirm('Delete this version?')) return
    const res  = await fetch(`/api/extensions/versions/${versionId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setMsg({ text: res.ok && data.success ? 'Version deleted.' : data.error || 'Failed.', ok: res.ok && !!data.success })
    if (res.ok) {
      const vr = await fetch(`/api/extensions/${project.id}/versions`)
      setVersions(vr.ok ? (await vr.json().catch(() => [])) : [])
    }
  }

  const deleteProject = async () => {
    const expected = `${auth.user?.username}/${project.identifier}`
    if (window.prompt(`Type "${expected}" to confirm deletion`) !== expected) return
    const res = await fetch(`/api/extensions/${project.id}`, { method: 'DELETE' })
    if (res.ok) navigate('/profile')
  }

  const typeLabel = type === 'theme' ? 'Theme' : 'Extension'
  const TypeIcon  = type === 'theme' ? Palette : Puzzle

  // ── auth gates ──────────────────────────────────────────────────────────

  if (auth.loading || loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-4xl px-5 pt-28 pb-24 lg:px-10">
          <div className="h-96 animate-pulse rounded-2xl bg-white/4" />
        </div>
      </PageShell>
    )
  }

  if (!auth.loggedIn) {
    return (
      <PageShell>
        <div className="flex min-h-[75vh] flex-col items-center justify-center px-5 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <User className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-black text-white">Sign in to continue</h1>
          <p className="mt-3 max-w-md text-base text-white/40">You need an account to submit a project.</p>
          <a href={auth.loginUrl} className="mt-7 flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
            Continue with Google
          </a>
        </div>
      </PageShell>
    )
  }

  if (isEdit && (notFound || (project && project.user_id && auth.user?.id && Number(project.user_id) !== Number(auth.user.id) && auth.user?.role !== 'admin'))) {
    return (
      <PageShell>
        <div className="flex min-h-[75vh] flex-col items-center justify-center px-5 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-black text-white">Not found</h1>
          <p className="mt-3 max-w-md text-base text-white/40">This project doesn't exist, or you don't have permission to edit it.</p>
          <Link to="/profile" className="mt-7 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
            Back to profile
          </Link>
        </div>
      </PageShell>
    )
  }

  // ── main ──────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-5 pb-24 pt-24 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link to={isEdit ? `/extensions/${project?.identifier || id}` : '/dashboard'} className="mb-5 flex w-fit items-center gap-1.5 text-xs font-semibold text-white/40 transition-colors hover:text-white">
            <ChevronLeft className="h-3.5 w-3.5" /> {isEdit ? 'Back to project' : 'Back to dashboard'}
          </Link>

          <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TypeIcon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-white">
                    {isEdit ? `Editing: ${project?.name}` : `New ${typeLabel}`}
                  </h1>
                  <p className="mt-0.5 text-xs text-white/30">
                    {isEdit ? `ID: ${project?.identifier}` : `Submit a new ${typeLabel.toLowerCase()} for review`}
                  </p>
                </div>
              </div>
              {isEdit && <StatusBadge status={project?.status} />}
            </div>

            {isEdit && (
              <div className="flex gap-1 border-b border-white/5 px-3 pt-2">
                {[
                  { id: 'meta',     label: 'Metadata',  icon: FileText },
                  { id: 'versions', label: 'Versions',  icon: Tag      },
                ].map(t => {
                  const Icon = t.icon
                  return (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                        tab === t.id ? 'border-primary text-primary' : 'border-transparent text-white/35 hover:text-white/60'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />{t.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="p-6">
              {(!isEdit || tab === 'meta') && (
                <form onSubmit={handleMetaSubmit} className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Project Name">
                      <input value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} className={inputClass} placeholder={`My ${typeLabel}`} required />
                    </Field>
                    <Field label="Identifier" hint={isEdit ? 'locked' : undefined}>
                      <input value={form.identifier} onChange={e => setForm(v => ({ ...v, identifier: e.target.value }))} disabled={isEdit} className={`${inputClass} ${isEdit ? 'opacity-40 cursor-not-allowed' : ''}`} placeholder="dev.my-extension" required />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Visibility">
                      <select value={form.visibility} onChange={e => setForm(v => ({ ...v, visibility: e.target.value }))} className={inputClass}>
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                      </select>
                    </Field>
                    {!isEdit && (
                      <Field label="Initial Version">
                        <input value={form.version} onChange={e => setForm(v => ({ ...v, version: e.target.value }))} className={inputClass} placeholder="1.0.0" required />
                      </Field>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category" hint="Optional, helps people find it">
                      <select value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} className={inputClass}>
                        <option value="">None</option>
                        {filterOptions.categories.map(c => <option key={c} value={c}>{capitalize(c)}</option>)}
                      </select>
                    </Field>
                    <Field label="Minecraft Version" hint="Optional">
                      <select value={form.mcVersion} onChange={e => setForm(v => ({ ...v, mcVersion: e.target.value }))} className={inputClass}>
                        <option value="">Any / unspecified</option>
                        {filterOptions.mcVersions.map(mv => <option key={mv} value={mv}>{mv}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Summary" hint="Short description, shown on marketplace cards">
                    <input value={form.summary} onChange={e => setForm(v => ({ ...v, summary: e.target.value }))} className={inputClass} placeholder="A one-line description" required />
                  </Field>

                  <Field label="Description (Markdown)">
                    <textarea rows={6} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} className={`${inputClass} resize-y`} placeholder="Full description with **markdown** support…" required />
                  </Field>

                  {form.description && (
                    <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/20">Preview</p>
                      <MarkdownContent content={form.description} />
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Banner Image">
                      <input type="file" accept="image/*" onChange={e => setBannerFile(e.target.files?.[0] || null)} className={fileClass} />
                    </Field>
                    {!isEdit && (
                      <Field label={`${typeLabel} File`}>
                        <input type="file" onChange={e => setProjectFile(e.target.files?.[0] || null)} className={fileClass} required />
                      </Field>
                    )}
                  </div>

                  {msg.text && (
                    <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${msg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                      {msg.text}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button type="submit" disabled={submitting} className="flex items-center gap-2 self-start rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light disabled:opacity-50">
                      <Upload className="h-4 w-4" />
                      {isEdit ? 'Save changes' : 'Submit for review'}
                    </button>
                    {isEdit && (
                      <button type="button" onClick={deleteProject} className="flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/8 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15">
                        <Trash2 className="h-3.5 w-3.5" /> Delete project
                      </button>
                    )}
                  </div>
                </form>
              )}

              {isEdit && tab === 'versions' && (
                <div className="flex flex-col gap-5">
                  <form onSubmit={handleVersionSubmit} className="flex flex-col gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-white/30">Upload New Version</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Version number">
                        <input value={versionForm.version} onChange={e => setVersionForm(v => ({ ...v, version: e.target.value }))} className={inputClass} placeholder="1.2.0" required />
                      </Field>
                      <Field label="Build file">
                        <input type="file" onChange={e => setVersionFile(e.target.files?.[0] || null)} className={fileClass} required />
                      </Field>
                    </div>
                    <Field label="Changelog">
                      <textarea rows={3} value={versionForm.changelog} onChange={e => setVersionForm(v => ({ ...v, changelog: e.target.value }))} className={`${inputClass} resize-none`} placeholder="What's new in this release?" />
                    </Field>
                    {msg.text && (
                      <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${msg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                        {msg.text}
                      </div>
                    )}
                    <button type="submit" className="flex items-center gap-2 self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
                      <Upload className="h-3.5 w-3.5" /> Submit version
                    </button>
                  </form>

                  <div className="flex flex-col gap-2">
                    {versions.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/8 py-10 text-center">
                        <Tag className="h-5 w-5 text-white/15" />
                        <p className="text-xs text-white/25">No versions yet</p>
                      </div>
                    ) : versions.map(v => (
                      <div key={v.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">{v.version}</span>
                            <StatusBadge status={v.status} />
                          </div>
                          <p className="mt-1 text-xs text-white/35 line-clamp-1">{v.changelog || 'No changelog'}</p>
                          <p className="mt-1 text-[10px] text-white/20">{new Date(v.created_at).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => deleteVersion(v.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/20 transition-colors hover:bg-red-500/10 hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </PageShell>
  )
}
