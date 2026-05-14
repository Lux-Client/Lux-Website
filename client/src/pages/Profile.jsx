import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'
import useAuth, { fixPath } from '../hooks/useAuth'

const initialProjectForm = {
  name: '',
  identifier: '',
  summary: '',
  description: '',
  type: 'extension',
  visibility: 'public',
  version: '1.0.0',
}

export default function Profile() {
  const auth = useAuth()
  const [searchParams] = useSearchParams()
  const [profileForm, setProfileForm] = useState({ username: '', bio: '', avatar: '', is_private: false })
  const [profileMessage, setProfileMessage] = useState('')
  const [projects, setProjects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [projectForm, setProjectForm] = useState(initialProjectForm)
  const [versions, setVersions] = useState([])
  const [versionForm, setVersionForm] = useState({ version: '', changelog: '' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [projectFile, setProjectFile] = useState(null)
  const [versionFile, setVersionFile] = useState(null)
  const [message, setMessage] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const selectedProject = useMemo(
    () => projects.find((project) => Number(project.id) === Number(selectedId)) || null,
    [projects, selectedId],
  )

  useEffect(() => {
    if (!auth.user) return
    setProfileForm({
      username: auth.user.username || '',
      bio: auth.user.bio || '',
      avatar: auth.user.avatar || auth.user.avatar_url || '',
      is_private: !!auth.user.is_private,
    })
  }, [auth.user])

  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const response = await fetch('/api/user/extensions')
      const data = response.ok ? await response.json() : []
      const items = Array.isArray(data) ? data : []
      setProjects(items)

      const requestedEditId = searchParams.get('edit')
      if (requestedEditId) {
        const nextProject = items.find((item) => String(item.id) === requestedEditId)
        if (nextProject) selectProject(nextProject)
      }
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    if (auth.loggedIn) loadProjects()
  }, [auth.loggedIn])

  useEffect(() => {
    if (!selectedProject) {
      setVersions([])
      return
    }

    fetch(`/api/extensions/${selectedProject.id}/versions`)
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setVersions(Array.isArray(data) ? data : []))
  }, [selectedProject])

  const selectProject = (project) => {
    setSelectedId(project.id)
    setProjectForm({
      name: project.name || '',
      identifier: project.identifier || '',
      summary: project.summary || '',
      description: project.description || '',
      type: project.type || 'extension',
      visibility: project.visibility || 'public',
      version: '1.0.0',
    })
    setMessage('')
  }

  const resetProjectEditor = () => {
    setSelectedId(null)
    setProjectForm(initialProjectForm)
    setBannerFile(null)
    setProjectFile(null)
    setVersionFile(null)
    setVersionForm({ version: '', changelog: '' })
    setVersions([])
  }

  const handleProfileSubmit = async (event) => {
    event.preventDefault()
    const formData = new FormData()
    formData.append('username', profileForm.username)
    formData.append('bio', profileForm.bio)
    formData.append('avatar', profileForm.avatar)
    formData.append('is_private', String(profileForm.is_private))
    if (avatarFile) formData.append('avatarFile', avatarFile)

    const response = await fetch('/api/user/update', { method: 'POST', body: formData })
    const data = await response.json().catch(() => ({}))
    setProfileMessage(response.ok ? 'Profile updated successfully.' : data.error || 'Failed to update profile.')
  }

  const handleProjectSubmit = async (event) => {
    event.preventDefault()
    const formData = new FormData()
    Object.entries(projectForm).forEach(([key, value]) => formData.append(key, value))
    if (bannerFile) formData.append('bannerImage', bannerFile)
    if (projectFile) formData.append('extensionFile', projectFile)

    const endpoint = selectedProject ? `/api/extensions/update/${selectedProject.id}` : '/api/extensions/upload'
    const response = await fetch(endpoint, { method: 'POST', body: formData })
    const data = await response.json().catch(() => ({}))

    if (!response.ok || !data.success) {
      setMessage(data.error || 'Failed to submit project.')
      return
    }

    setMessage(selectedProject ? 'Project updated successfully.' : 'Project submitted for review.')
    resetProjectEditor()
    await loadProjects()
  }

  const handleVersionSubmit = async (event) => {
    event.preventDefault()
    if (!selectedProject || !versionFile) return

    const formData = new FormData()
    formData.append('extensionFile', versionFile)
    formData.append('version', versionForm.version)
    formData.append('changelog', versionForm.changelog)

    const response = await fetch(`/api/extensions/${selectedProject.id}/version`, { method: 'POST', body: formData })
    const data = await response.json().catch(() => ({}))
    setMessage(response.ok && data.success ? 'Version submitted for review.' : data.error || 'Version upload failed.')

    if (response.ok && data.success) {
      setVersionForm({ version: '', changelog: '' })
      setVersionFile(null)
      const versionsResponse = await fetch(`/api/extensions/${selectedProject.id}/versions`)
      const versionsData = versionsResponse.ok ? await versionsResponse.json() : []
      setVersions(Array.isArray(versionsData) ? versionsData : [])
    }
  }

  const deleteProject = async (project) => {
    const expected = `${auth.user?.username}/${project.identifier}`
    if (window.prompt(`Type ${expected} to delete this project.`) !== expected) return
    const response = await fetch(`/api/extensions/${project.id}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    setMessage(response.ok && data.success ? 'Project deleted.' : data.error || 'Deletion failed.')
    if (response.ok) {
      if (selectedId === project.id) resetProjectEditor()
      await loadProjects()
    }
  }

  const deleteVersion = async (versionId) => {
    if (!window.confirm('Delete this version?')) return
    const response = await fetch(`/api/extensions/versions/${versionId}`, { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    setMessage(response.ok && data.success ? 'Version deleted.' : data.error || 'Failed to delete version.')
    if (response.ok && selectedProject) {
      const versionsResponse = await fetch(`/api/extensions/${selectedProject.id}/versions`)
      const versionsData = versionsResponse.ok ? await versionsResponse.json() : []
      setVersions(Array.isArray(versionsData) ? versionsData : [])
    }
  }

  const deleteAccount = async () => {
    if (window.prompt('Type "delete my account" to confirm account deletion.') !== 'delete my account') return
    const response = await fetch('/api/user/delete', { method: 'DELETE' })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.success) {
      window.location.href = '/?deleted=true'
    } else {
      setProfileMessage(data.error || 'Failed to delete account.')
    }
  }

  if (auth.loading) {
    return <PageShell><div className="mx-auto max-w-7xl px-6 pb-24 pt-32"><div className="h-[30rem] animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" /></div></PageShell>
  }

  if (!auth.loggedIn) {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-5xl font-black text-white">Sign in to manage your profile</h1>
          <p className="mt-4 text-lg text-gray-400">Upload addons, update your identity, and control the visibility of your public creator profile.</p>
          <a href={auth.loginUrl} className="mt-8 rounded-2xl bg-primary px-7 py-4 font-black text-black transition hover:bg-primary-dark">Continue with Google</a>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-12">
        <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
            <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
              <img src={fixPath(profileForm.avatar || auth.user?.avatar || auth.user?.avatar_url)} alt={profileForm.username} className="h-28 w-28 rounded-[2rem] border border-white/10 object-cover" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Profile</p>
                <h1 className="mt-3 text-4xl font-black text-white">{auth.user?.username}</h1>
                <p className="mt-3 max-w-xl text-gray-400">Update your public creator profile, upload a new avatar, and manage privacy settings.</p>
                {auth.user?.role === 'admin' && <Link to="/admin" className="mt-4 inline-block text-sm font-bold text-primary hover:text-white">Open admin panel</Link>}
              </div>
            </div>

            <form onSubmit={handleProfileSubmit} className="mt-8 space-y-5">
              <FormField label="Username"><input value={profileForm.username} onChange={(event) => setProfileForm((value) => ({ ...value, username: event.target.value }))} className="input" /></FormField>
              <FormField label="Bio"><textarea rows="4" value={profileForm.bio} onChange={(event) => setProfileForm((value) => ({ ...value, bio: event.target.value }))} className="input resize-none" /></FormField>
              <FormField label="Avatar URL"><input value={profileForm.avatar} onChange={(event) => setProfileForm((value) => ({ ...value, avatar: event.target.value }))} className="input" /></FormField>
              <FormField label="Upload Avatar"><input type="file" accept="image/*" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} className="input file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-black" /></FormField>
              <label className="flex items-center gap-3 rounded-2xl border border-white/5 bg-black/20 p-4 text-sm text-gray-300">
                <input type="checkbox" checked={profileForm.is_private} onChange={(event) => setProfileForm((value) => ({ ...value, is_private: event.target.checked }))} />
                Hide my public creator profile even if I have approved extensions.
              </label>
              {profileMessage && <p className="text-sm font-bold text-primary">{profileMessage}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">Save profile</button>
                <button type="button" onClick={deleteAccount} className="rounded-xl border border-red-500/20 bg-red-500/10 px-6 py-3 font-bold text-red-300 transition hover:bg-red-500/20">Delete account</button>
              </div>
            </form>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Projects</p>
                <h2 className="mt-3 text-4xl font-black text-white">{selectedProject ? `Editing ${selectedProject.name}` : 'Create a new addon'}</h2>
                <p className="mt-3 text-gray-400">Submit new extensions and themes, edit existing metadata, and manage release history.</p>
              </div>
              {selectedProject && <button onClick={resetProjectEditor} className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">New upload</button>}
            </div>

            <form onSubmit={handleProjectSubmit} className="mt-8 space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <FormField label="Project Name"><input value={projectForm.name} onChange={(event) => setProjectForm((value) => ({ ...value, name: event.target.value }))} className="input" required /></FormField>
                <FormField label="Identifier"><input value={projectForm.identifier} disabled={!!selectedProject} onChange={(event) => setProjectForm((value) => ({ ...value, identifier: event.target.value }))} className="input disabled:opacity-60" required /></FormField>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <FormField label="Type"><select value={projectForm.type} onChange={(event) => setProjectForm((value) => ({ ...value, type: event.target.value }))} className="input"><option value="extension">Extension</option><option value="theme">Theme</option></select></FormField>
                <FormField label="Visibility"><select value={projectForm.visibility} onChange={(event) => setProjectForm((value) => ({ ...value, visibility: event.target.value }))} className="input"><option value="public">Public</option><option value="unlisted">Unlisted</option></select></FormField>
                {!selectedProject && <FormField label="Initial Version"><input value={projectForm.version} onChange={(event) => setProjectForm((value) => ({ ...value, version: event.target.value }))} className="input" required /></FormField>}
              </div>
              <FormField label="Summary"><input value={projectForm.summary} onChange={(event) => setProjectForm((value) => ({ ...value, summary: event.target.value }))} className="input" required /></FormField>
              <FormField label="Description (Markdown)"><textarea rows="8" value={projectForm.description} onChange={(event) => setProjectForm((value) => ({ ...value, description: event.target.value }))} className="input resize-y" required /></FormField>
              <div className="grid gap-5 md:grid-cols-2">
                <FormField label={selectedProject ? 'Update Banner Image' : 'Banner Image'}><input type="file" accept="image/*" onChange={(event) => setBannerFile(event.target.files?.[0] || null)} className="input file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-black" /></FormField>
                {!selectedProject && <FormField label="Extension File"><input type="file" onChange={(event) => setProjectFile(event.target.files?.[0] || null)} className="input file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-black" required /></FormField>}
              </div>
              <div className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">Markdown preview</p>
                <div className="mt-4 rounded-2xl border border-white/5 bg-background/80 p-5">
                  <MarkdownContent content={projectForm.description || 'Preview will appear here...'} />
                </div>
              </div>
              {message && <p className="text-sm font-bold text-primary">{message}</p>}
              <button type="submit" className="rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">{selectedProject ? 'Update project' : 'Submit project'}</button>
            </form>
          </div>
        </section>

        <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white">My projects</h2>
                <p className="mt-2 text-gray-400">Jump into editing mode, review current status, or delete an old project.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-gray-300">{projects.length} total</span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {loadingProjects ? (
                <div className="rounded-[1.5rem] border border-white/5 bg-black/20 p-8 text-center text-gray-500 md:col-span-2">Loading projects...</div>
              ) : projects.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-8 text-center text-gray-500 md:col-span-2">No uploads yet.</div>
              ) : projects.map((project) => (
                <div key={project.id} className={`rounded-[1.5rem] border p-5 ${selectedProject?.id === project.id ? 'border-primary/30 bg-primary/5' : 'border-white/5 bg-black/20'}`}>
                  <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-black/30">
                    <img src={fixPath(project.banner_path)} alt={project.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">{project.type || 'extension'}</p>
                      <h3 className="mt-2 text-2xl font-black text-white">{project.name}</h3>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">{project.status}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-gray-400">{project.summary || project.description}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button onClick={() => selectProject(project)} className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-black transition hover:bg-primary-dark">Manage</button>
                    <Link to={`/extensions/${project.identifier || project.id}`} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-primary/40 hover:text-primary">View page</Link>
                    <button onClick={() => deleteProject(project)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white">Version history</h2>
                <p className="mt-2 text-gray-400">Select a project to upload a new build or remove an old release.</p>
              </div>
              {selectedProject && <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-primary">{selectedProject.name}</span>}
            </div>

            {selectedProject ? (
              <>
                <form onSubmit={handleVersionSubmit} className="mt-6 space-y-4 rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                  <FormField label="Version"><input value={versionForm.version} onChange={(event) => setVersionForm((value) => ({ ...value, version: event.target.value }))} className="input" required /></FormField>
                  <FormField label="Changelog"><textarea rows="4" value={versionForm.changelog} onChange={(event) => setVersionForm((value) => ({ ...value, changelog: event.target.value }))} className="input resize-none" /></FormField>
                  <FormField label="Build File"><input type="file" onChange={(event) => setVersionFile(event.target.files?.[0] || null)} className="input file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-black" required /></FormField>
                  <button type="submit" className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Submit new version</button>
                </form>

                <div className="mt-6 space-y-3">
                  {versions.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-8 text-center text-gray-500">No versions uploaded yet.</div>
                  ) : versions.map((version) => (
                    <div key={version.id} className="rounded-[1.5rem] border border-white/5 bg-black/20 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xl font-black text-white">{version.version}</p>
                          <p className="mt-2 text-sm text-gray-400">{version.changelog || 'Initial upload'}</p>
                          <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-gray-500">{new Date(version.created_at).toLocaleDateString()} · {version.status}</p>
                        </div>
                        <button onClick={() => deleteVersion(version.id)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-10 text-center text-gray-500">Choose a project on the left to manage its versions.</div>
            )}
          </div>
        </section>
      </main>
    </PageShell>
  )
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-gray-400">{label}</span>
      {children}
    </label>
  )
}
