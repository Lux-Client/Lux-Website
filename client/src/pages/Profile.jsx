import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Camera, Save, Trash2, Plus, Image, ChevronRight, ExternalLink,
  AlertTriangle, CheckCircle2, Clock, XCircle, RefreshCw, User, FileText,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import useAuth, { fixPath } from '../hooks/useAuth'

// ── helpers ─────────────────────────────────────────────────────────────────

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

// ── component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const auth = useAuth()

  const [profileForm,     setProfileForm]     = useState({ username: '', bio: '', avatar: '', is_private: false })
  const [profileMsg,      setProfileMsg]      = useState({ text: '', ok: true })
  const [avatarFile,      setAvatarFile]      = useState(null)
  const [avatarPreview,   setAvatarPreview]   = useState(null)

  const [projects,        setProjects]        = useState([])
  const [loadingProjects, setLoadingProjects] = useState(false)

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
      setProjects(Array.isArray(items) ? items : [])
    } finally { setLoadingProjects(false) }
  }

  useEffect(() => { if (auth.loggedIn) loadProjects() }, [auth.loggedIn])

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

  const deleteProject = async project => {
    const expected = `${auth.user?.username}/${project.identifier}`
    if (window.prompt(`Type "${expected}" to confirm deletion`) !== expected) return
    const res  = await fetch(`/api/extensions/${project.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setProfileMsg({ text: res.ok && data.success ? 'Deleted.' : data.error || 'Deletion failed.', ok: res.ok && !!data.success })
    if (res.ok) loadProjects()
  }

  const deleteAccount = async () => {
    if (window.prompt('Type "delete my account" to confirm') !== 'delete my account') return
    const res  = await fetch('/api/user/delete', { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) window.location.href = '/?deleted=true'
    else setProfileMsg({ text: data.error || 'Failed to delete account.', ok: false })
  }

  // ── display avatar ────────────────────────────────────────────────────────

  const displayAvatar = avatarPreview
    || (auth.user?.avatar_url?.startsWith('http') ? auth.user.avatar_url : null)
    || fixPath(auth.user?.avatar || auth.user?.avatar_url)

  // ── not logged in / loading ───────────────────────────────────────────────

  if (auth.loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-7xl px-5 pt-28 pb-24 lg:px-10">
          <div className="h-28 animate-pulse rounded-2xl bg-white/4 mb-5" />
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
      <main className="mx-auto max-w-5xl px-5 pb-24 pt-24 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6"
        >

          {/* ── Profile settings ── */}
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
                    onError={e => {
                      const google = auth.user?.avatar_url || auth.user?.avatar || ''
                      if (google.startsWith('http') && e.currentTarget.src !== google) {
                        e.currentTarget.src = google
                      } else {
                        e.currentTarget.src = '/resources/lux_icon.png?v=3'
                      }
                    }}
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Username">
                    <input value={profileForm.username} onChange={e => setProfileForm(v => ({ ...v, username: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Avatar URL" hint="Or use the camera button above to upload">
                    <input value={profileForm.avatar} onChange={e => setProfileForm(v => ({ ...v, avatar: e.target.value }))} className={inputClass} placeholder="https://…" />
                  </Field>
                </div>
                <Field label="Bio">
                  <textarea rows={3} value={profileForm.bio} onChange={e => setProfileForm(v => ({ ...v, bio: e.target.value }))} className={`${inputClass} resize-none`} placeholder="Tell the community about yourself…" />
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

          {/* ── Projects grid ── */}
          <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-6 py-5">
              <div>
                <h2 className="text-base font-bold text-white">My Projects</h2>
                <p className="mt-0.5 text-xs text-white/30">{projects.length} project{projects.length !== 1 ? 's' : ''} uploaded</p>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/dashboard" className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-black shadow-glow-sm transition hover:bg-primary-light">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </Link>
                <button onClick={loadProjects} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 text-white/30 transition-colors hover:bg-white/6 hover:text-white">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="p-5">
              {loadingProjects ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-white/4" />)}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/4">
                    <FileText className="h-5 w-5 text-white/15" />
                  </div>
                  <p className="text-sm text-white/30">No uploads yet.</p>
                  <Link to="/dashboard" className="rounded-xl bg-primary/10 border border-primary/15 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-black">
                    Submit your first project
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {projects.map(project => (
                    <div
                      key={project.id}
                      className="flex flex-col overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] transition-all hover:border-white/10"
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
                          <Link
                            to={`/extensions/${project.id}/edit`}
                            className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/15 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary hover:text-black hover:border-primary"
                          >
                            <FileText className="h-3 w-3" /> Edit
                          </Link>
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
