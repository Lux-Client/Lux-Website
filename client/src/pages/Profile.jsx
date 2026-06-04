import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Camera, Save, Trash2, Plus, Upload, Eye, EyeOff,
  Package, Tag, FileText, Image, ChevronRight, ExternalLink,
  AlertTriangle, CheckCircle2, Clock, XCircle, RefreshCw, User,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'
import useAuth, { fixPath } from '../hooks/useAuth'

// ── helpers ─────────────────────────────────────────────────────────────────

const initialProjectForm = {
  name: '', identifier: '', summary: '', description: '',
  type: 'extension', visibility: 'public', version: '1.0.0',
}

const STATUS = {
  approved:        { label: 'Approved',        color: '#10b981', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle2 },
  pending:         { label: 'Pending',          color: '#f59e0b', bg: 'bg-amber-500/10',   text: 'text-amber-400',   icon: Clock        },
  rejected:        { label: 'Rejected',         color: '#ef4444', bg: 'bg-red-500/10',     text: 'text-red-400',     icon: XCircle      },
  action_required: { label: 'Action Required',  color: '#3b82f6', bg: 'bg-blue-500/10',    text: 'text-blue-400',    icon: AlertTriangle},
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

// ── component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const auth            = useAuth()
  const [searchParams]  = useSearchParams()

  const [profileForm,     setProfileForm]     = useState({ username: '', bio: '', avatar: '', is_private: false })
  const [profileMsg,      setProfileMsg]      = useState({ text: '', ok: true })
  const [avatarFile,      setAvatarFile]      = useState(null)
  const [avatarPreview,   setAvatarPreview]   = useState(null)

  const [projects,        setProjects]        = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [selectedId,      setSelectedId]      = useState(null)
  const [projectForm,     setProjectForm]     = useState(initialProjectForm)
  const [editorTab,       setEditorTab]       = useState('meta')
  const [bannerFile,      setBannerFile]      = useState(null)
  const [projectFile,     setProjectFile]     = useState(null)
  const [projectMsg,      setProjectMsg]      = useState({ text: '', ok: true })

  const [versions,        setVersions]        = useState([])
  const [versionForm,     setVersionForm]     = useState({ version: '', changelog: '' })
  const [versionFile,     setVersionFile]     = useState(null)

  const editorRef = useRef(null)

  const selectedProject = useMemo(
    () => projects.find(p => Number(p.id) === Number(selectedId)) || null,
    [projects, selectedId],
  )

  // Populate profile form from auth
  useEffect(() => {
    if (!auth.user) return
    setProfileForm({
      username: auth.user.username || '',
      bio:      auth.user.bio || '',
      avatar:   auth.user.avatar || auth.user.avatar_url || '',
      is_private: !!auth.user.is_private,
    })
  }, [auth.user])

  // Revoke old preview blob
  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }
  }, [avatarPreview])

  // Load projects
  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const res   = await fetch('/api/user/extensions')
      const items = res.ok ? (await res.json().catch(() => [])) : []
      const list  = Array.isArray(items) ? items : []
      setProjects(list)
      const editId = searchParams.get('edit')
      if (editId) {
        const hit = list.find(p => String(p.id) === editId)
        if (hit) { selectProject(hit); setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150) }
      }
    } finally { setLoadingProjects(false) }
  }

  useEffect(() => { if (auth.loggedIn) loadProjects() }, [auth.loggedIn])

  // Load versions when project selected
  useEffect(() => {
    if (!selectedProject) { setVersions([]); return }
    fetch(`/api/extensions/${selectedProject.id}/versions`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setVersions(Array.isArray(d) ? d : []))
  }, [selectedProject])

  const selectProject = project => {
    setSelectedId(project.id)
    setProjectForm({
      name:        project.name        || '',
      identifier:  project.identifier  || '',
      summary:     project.summary     || '',
      description: project.description || '',
      type:        project.type        || 'extension',
      visibility:  project.visibility  || 'public',
      version:     '1.0.0',
    })
    setEditorTab('meta')
    setProjectMsg({ text: '', ok: true })
    setBannerFile(null); setProjectFile(null)
  }

  const resetEditor = () => {
    setSelectedId(null)
    setProjectForm(initialProjectForm)
    setBannerFile(null); setProjectFile(null); setVersionFile(null)
    setVersionForm({ version: '', changelog: '' })
    setVersions([])
    setProjectMsg({ text: '', ok: true })
  }

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleAvatarChange = file => {
    setAvatarFile(file)
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarPreview(file ? URL.createObjectURL(file) : null)
  }

  const handleProfileSubmit = async e => {
    e.preventDefault()
    const fd = new FormData()
    fd.append('username',   profileForm.username)
    fd.append('bio',        profileForm.bio)
    fd.append('avatar',     profileForm.avatar)
    fd.append('is_private', String(profileForm.is_private))
    if (avatarFile) fd.append('avatarFile', avatarFile)
    const res  = await fetch('/api/user/update', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setProfileMsg({ text: 'Profile saved!', ok: true })
      // Refresh page so navbar avatar updates
      setTimeout(() => window.location.reload(), 800)
    } else {
      setProfileMsg({ text: data.error || 'Failed to save profile.', ok: false })
    }
  }

  const handleProjectSubmit = async e => {
    e.preventDefault()
    const fd = new FormData()
    Object.entries(projectForm).forEach(([k, v]) => fd.append(k, v))
    if (bannerFile)  fd.append('bannerImage',   bannerFile)
    if (projectFile) fd.append('extensionFile', projectFile)
    const endpoint = selectedProject ? `/api/extensions/update/${selectedProject.id}` : '/api/extensions/upload'
    const res  = await fetch(endpoint, { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      setProjectMsg({ text: data.error || 'Submission failed.', ok: false })
    } else {
      setProjectMsg({ text: selectedProject ? 'Project updated!' : 'Submitted for review!', ok: true })
      resetEditor(); loadProjects()
    }
  }

  const handleVersionSubmit = async e => {
    e.preventDefault()
    if (!selectedProject || !versionFile) return
    const fd = new FormData()
    fd.append('extensionFile', versionFile)
    fd.append('version',    versionForm.version)
    fd.append('changelog',  versionForm.changelog)
    const res  = await fetch(`/api/extensions/${selectedProject.id}/version`, { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) {
      setProjectMsg({ text: 'Version submitted for review!', ok: true })
      setVersionForm({ version: '', changelog: '' }); setVersionFile(null)
      const vr = await fetch(`/api/extensions/${selectedProject.id}/versions`)
      setVersions(vr.ok ? (await vr.json().catch(() => [])) : [])
    } else {
      setProjectMsg({ text: data.error || 'Version upload failed.', ok: false })
    }
  }

  const deleteProject = async project => {
    const expected = `${auth.user?.username}/${project.identifier}`
    if (window.prompt(`Type "${expected}" to confirm deletion`) !== expected) return
    const res  = await fetch(`/api/extensions/${project.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setProjectMsg({ text: res.ok && data.success ? 'Deleted.' : data.error || 'Deletion failed.', ok: res.ok && !!data.success })
    if (res.ok) { if (selectedId === project.id) resetEditor(); loadProjects() }
  }

  const deleteVersion = async versionId => {
    if (!window.confirm('Delete this version?')) return
    const res  = await fetch(`/api/extensions/versions/${versionId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setProjectMsg({ text: res.ok && data.success ? 'Version deleted.' : data.error || 'Failed.', ok: res.ok && !!data.success })
    if (res.ok && selectedProject) {
      const vr = await fetch(`/api/extensions/${selectedProject.id}/versions`)
      setVersions(vr.ok ? (await vr.json().catch(() => [])) : [])
    }
  }

  const deleteAccount = async () => {
    if (window.prompt('Type "delete my account" to confirm') !== 'delete my account') return
    const res  = await fetch('/api/user/delete', { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) window.location.href = '/?deleted=true'
    else setProfileMsg({ text: data.error || 'Failed to delete account.', ok: false })
  }

  // ── display avatar ────────────────────────────────────────────────────────

  const displayAvatar = avatarPreview || fixPath(auth.user?.avatar || auth.user?.avatar_url)

  // ── not logged in / loading ───────────────────────────────────────────────

  if (auth.loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-7xl px-5 pt-28 pb-24 lg:px-10">
          <div className="h-28 animate-pulse rounded-2xl bg-white/4 mb-5" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-96 animate-pulse rounded-2xl bg-white/4" />
            <div className="h-96 animate-pulse rounded-2xl bg-white/4" />
          </div>
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
          <h1 className="text-3xl font-black text-white">Sign in to manage your profile</h1>
          <p className="mt-3 max-w-md text-base text-white/40">Upload addons, update your identity, and control the visibility of your creator profile.</p>
          <a href={auth.loginUrl} className="mt-7 flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
            Continue with Google <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </PageShell>
    )
  }

  // ── main ──────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-24 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6"
        >

          {/* ── Top section: profile settings + extension editor ── */}
          <div className="grid gap-5 lg:grid-cols-2">

            {/* Profile settings */}
            <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
              <div className="border-b border-white/5 px-6 py-5">
                <h2 className="text-base font-bold text-white">Profile Settings</h2>
                <p className="mt-0.5 text-xs text-white/30">Manage your public identity and avatar</p>
              </div>
              <div className="p-6">
                {/* Avatar */}
                <div className="mb-6 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <img
                      src={displayAvatar}
                      alt={auth.user?.username}
                      className="h-20 w-20 rounded-2xl border border-white/10 object-cover bg-white/4"
                      onError={e => { e.currentTarget.src = '/resources/lux_icon.png?v=3' }}
                    />
                    <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-[#0f0f0f] text-white/50 transition-colors hover:bg-white/10 hover:text-white">
                      <Camera className="h-3.5 w-3.5" />
                      <input type="file" accept="image/*" className="hidden" onChange={e => handleAvatarChange(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                  <div>
                    <p className="font-bold text-white">{auth.user?.username}</p>
                    <p className="mt-0.5 text-xs text-white/30">{auth.user?.email}</p>
                    {auth.user?.role === 'admin' && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">Admin</span>
                    )}
                  </div>
                </div>

                <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
                  <Field label="Username">
                    <input value={profileForm.username} onChange={e => setProfileForm(v => ({ ...v, username: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Bio">
                    <textarea rows={3} value={profileForm.bio} onChange={e => setProfileForm(v => ({ ...v, bio: e.target.value }))} className={`${inputClass} resize-none`} placeholder="Tell the community about yourself…" />
                  </Field>
                  <Field label="Avatar URL" hint="Or use the camera button above to upload">
                    <input value={profileForm.avatar} onChange={e => setProfileForm(v => ({ ...v, avatar: e.target.value }))} className={inputClass} placeholder="https://…" />
                  </Field>

                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/10">
                    <div className={`relative h-5 w-9 rounded-full transition-colors ${profileForm.is_private ? 'bg-primary' : 'bg-white/12'}`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${profileForm.is_private ? 'left-[18px]' : 'left-0.5'}`} />
                    </div>
                    <input type="checkbox" checked={profileForm.is_private} onChange={e => setProfileForm(v => ({ ...v, is_private: e.target.checked }))} className="hidden" />
                    <div>
                      <p className="text-sm font-medium text-white/70">Private profile</p>
                      <p className="text-xs text-white/25">Hide your public creator page</p>
                    </div>
                  </label>

                  {profileMsg.text && (
                    <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${profileMsg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {profileMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                      {profileMsg.text}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="submit" className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                    {auth.user?.role === 'admin' && (
                      <Link to="/admin" className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-5 py-2.5 text-sm font-semibold text-white/60 transition hover:text-white">
                        Admin panel <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    <button type="button" onClick={deleteAccount} className="flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/8 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/15">
                      <Trash2 className="h-3.5 w-3.5" /> Delete account
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Extension editor */}
            <div ref={editorRef} className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-5">
                <div>
                  <h2 className="text-base font-bold text-white">
                    {selectedProject ? `Editing: ${selectedProject.name}` : 'New Extension'}
                  </h2>
                  <p className="mt-0.5 text-xs text-white/30">
                    {selectedProject ? `ID: ${selectedProject.identifier}` : 'Submit a new extension or theme'}
                  </p>
                </div>
                {selectedProject && (
                  <button onClick={resetEditor} className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/50 transition-colors hover:text-white">
                    <Plus className="h-3.5 w-3.5" /> New
                  </button>
                )}
              </div>

              {/* Tab bar */}
              {selectedProject && (
                <div className="flex gap-1 border-b border-white/5 px-3 pt-2">
                  {[
                    { id: 'meta',     label: 'Metadata',  icon: FileText },
                    { id: 'versions', label: 'Versions',  icon: Tag      },
                  ].map(t => {
                    const Icon = t.icon
                    return (
                      <button key={t.id} onClick={() => setEditorTab(t.id)}
                        className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                          editorTab === t.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-white/35 hover:text-white/60'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />{t.label}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="p-6">
                {/* ── Metadata form ── */}
                {(!selectedProject || editorTab === 'meta') && (
                  <form onSubmit={handleProjectSubmit} className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Project Name">
                        <input value={projectForm.name} onChange={e => setProjectForm(v => ({ ...v, name: e.target.value }))} className={inputClass} placeholder="My Extension" required />
                      </Field>
                      <Field label="Identifier" hint={selectedProject ? 'locked' : undefined}>
                        <input value={projectForm.identifier} onChange={e => setProjectForm(v => ({ ...v, identifier: e.target.value }))} disabled={!!selectedProject} className={`${inputClass} ${selectedProject ? 'opacity-40 cursor-not-allowed' : ''}`} placeholder="dev.my-extension" required />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Type">
                        <select value={projectForm.type} onChange={e => setProjectForm(v => ({ ...v, type: e.target.value }))} className={inputClass}>
                          <option value="extension">Extension</option>
                          <option value="theme">Theme</option>
                        </select>
                      </Field>
                      <Field label="Visibility">
                        <select value={projectForm.visibility} onChange={e => setProjectForm(v => ({ ...v, visibility: e.target.value }))} className={inputClass}>
                          <option value="public">Public</option>
                          <option value="unlisted">Unlisted</option>
                        </select>
                      </Field>
                      {!selectedProject && (
                        <Field label="Initial Version">
                          <input value={projectForm.version} onChange={e => setProjectForm(v => ({ ...v, version: e.target.value }))} className={inputClass} placeholder="1.0.0" required />
                        </Field>
                      )}
                    </div>

                    <Field label="Summary" hint="Short description, shown on marketplace cards">
                      <input value={projectForm.summary} onChange={e => setProjectForm(v => ({ ...v, summary: e.target.value }))} className={inputClass} placeholder="A one-line description" required />
                    </Field>

                    <Field label="Description (Markdown)">
                      <textarea rows={6} value={projectForm.description} onChange={e => setProjectForm(v => ({ ...v, description: e.target.value }))} className={`${inputClass} resize-y`} placeholder="Full description with **markdown** support…" required />
                    </Field>

                    {/* Preview */}
                    {projectForm.description && (
                      <div className="rounded-xl border border-white/5 bg-black/30 p-4">
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-white/20">Preview</p>
                        <MarkdownContent content={projectForm.description} />
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Banner Image">
                        <input type="file" accept="image/*" onChange={e => setBannerFile(e.target.files?.[0] || null)} className={fileClass} />
                      </Field>
                      {!selectedProject && (
                        <Field label="Extension File">
                          <input type="file" onChange={e => setProjectFile(e.target.files?.[0] || null)} className={fileClass} required />
                        </Field>
                      )}
                    </div>

                    {projectMsg.text && (
                      <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${projectMsg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {projectMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                        {projectMsg.text}
                      </div>
                    )}

                    <button type="submit" className="flex items-center gap-2 self-start rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
                      <Upload className="h-4 w-4" />
                      {selectedProject ? 'Save changes' : 'Submit for review'}
                    </button>
                  </form>
                )}

                {/* ── Versions tab ── */}
                {selectedProject && editorTab === 'versions' && (
                  <div className="flex flex-col gap-5">
                    {/* Upload form */}
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
                      {projectMsg.text && (
                        <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${projectMsg.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                          {projectMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                          {projectMsg.text}
                        </div>
                      )}
                      <button type="submit" className="flex items-center gap-2 self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
                        <Upload className="h-3.5 w-3.5" /> Submit version
                      </button>
                    </form>

                    {/* Version list */}
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
          </div>

          {/* ── Projects grid ── */}
          <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-5">
              <div>
                <h2 className="text-base font-bold text-white">My Extensions</h2>
                <p className="mt-0.5 text-xs text-white/30">{projects.length} project{projects.length !== 1 ? 's' : ''} uploaded</p>
              </div>
              <button onClick={loadProjects} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 text-white/30 transition-colors hover:bg-white/6 hover:text-white">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-5">
              {loadingProjects ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-white/4" />)}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/4">
                    <Package className="h-5 w-5 text-white/15" />
                  </div>
                  <p className="text-sm text-white/30">No uploads yet — use the editor above to submit your first extension.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {projects.map(project => (
                    <div
                      key={project.id}
                      className={`flex flex-col overflow-hidden rounded-xl border transition-all ${
                        selectedProject?.id === project.id
                          ? 'border-primary/25 bg-primary/5 ring-1 ring-primary/15'
                          : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                      }`}
                    >
                      {/* Banner */}
                      <div className="aspect-[16/9] overflow-hidden bg-white/4">
                        {project.banner_path ? (
                          <img
                            src={fixPath(project.banner_path)}
                            alt={project.name}
                            className="h-full w-full object-cover"
                            onError={e => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Image className="h-6 w-6 text-white/10" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex flex-1 flex-col p-3.5">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-white leading-tight">{project.name}</p>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="mb-3 line-clamp-2 flex-1 text-xs leading-relaxed text-white/30">
                          {project.summary || project.description || 'No description'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => { selectProject(project); editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                            className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/15 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary hover:text-black hover:border-primary"
                          >
                            <FileText className="h-3 w-3" /> Edit
                          </button>
                          <Link
                            to={`/extensions/${project.identifier || project.id}`}
                            className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:text-white"
                          >
                            <ExternalLink className="h-3 w-3" /> View
                          </Link>
                          <button
                            onClick={() => deleteProject(project)}
                            className="flex items-center gap-1 rounded-lg border border-red-500/10 bg-red-500/6 px-2.5 py-1.5 text-[11px] font-semibold text-red-400/60 transition-colors hover:bg-red-500/12 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </motion.div>
      </main>
    </PageShell>
  )
}
