import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Check, Clock, Copy, ExternalLink, Image as ImageIcon, Package, Search, Settings, Sparkles,
} from 'lucide-react'
import PageShell from '../components/PageShell'

// Shared modpack codes are 8 characters from [A-Za-z0-9] (see codes_system.js).
const CODE_PATTERN = /^[A-Za-z0-9]{8}$/
const MODRINTH_API = 'https://api.modrinth.com/v2'

const SECTIONS = [
  { key: 'mods', label: 'Mods', icon: Package, modrinthType: 'mod' },
  { key: 'resourcePacks', label: 'Resource Packs', icon: ImageIcon, modrinthType: 'resourcepack' },
  { key: 'shaders', label: 'Shaders', icon: Sparkles, modrinthType: 'shader' },
]

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// Codes only store project/version ids (plus title and icon from the launcher). Version
// numbers and missing icons come straight from Modrinth, in bulk.
async function fetchModrinthDetails(pack) {
  const items = SECTIONS.flatMap((section) => pack[section.key] || [])
  const versionIds = [...new Set(items.map((item) => item.versionId).filter(Boolean))]
  const projectIds = [...new Set(items.map((item) => item.projectId).filter(Boolean))]

  const versions = {}
  const projects = {}

  await Promise.all([
    ...chunk(versionIds, 100).map(async (ids) => {
      const res = await fetch(`${MODRINTH_API}/versions?ids=${encodeURIComponent(JSON.stringify(ids))}`)
      if (!res.ok) return
      for (const version of await res.json()) versions[version.id] = version
    }),
    ...chunk(projectIds, 100).map(async (ids) => {
      const res = await fetch(`${MODRINTH_API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)
      if (!res.ok) return
      for (const project of await res.json()) {
        projects[project.id] = project
        if (project.slug) projects[project.slug] = project
      }
    }),
  ])

  return { versions, projects }
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('de-DE')
}

function capitalize(value) {
  if (!value) return ''
  return String(value).charAt(0).toUpperCase() + String(value).slice(1)
}

function CodeEntry() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const valid = CODE_PATTERN.test(value)

  return (
    <PageShell>
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 pt-24 text-center sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/80">Modpack Code</p>
        <h1 className="mt-4 text-4xl font-black text-white">What&apos;s inside a code?</h1>
        <p className="mt-4 text-gray-400">
          Enter a Lux Client modpack code to see its mods, resource packs, shaders and settings before installing anything.
        </p>
        <form
          className="mt-8 flex w-full flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) navigate(`/code/${value}`)
          }}
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 8))}
            placeholder="e.g. aB3xY7zP"
            maxLength={8}
            autoFocus
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-center font-mono text-2xl tracking-widest text-white outline-none transition focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={!valid}
            className="rounded-2xl bg-primary px-7 py-4 font-black text-black transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            Show
          </button>
        </form>
      </main>
    </PageShell>
  )
}

export default function CodePreview() {
  const { code } = useParams()
  if (!code) return <CodeEntry />
  return <CodePreviewPage key={code} code={code} />
}

function CodePreviewPage({ code }) {
  const [pack, setPack] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [details, setDetails] = useState({ versions: {}, projects: {} })
  const [activeSection, setActiveSection] = useState('mods')
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [luxHint, setLuxHint] = useState(false)

  useEffect(() => {
    let active = true

    if (!CODE_PATTERN.test(code)) {
      setError('This is not a valid modpack code. Codes are 8 letters or digits.')
      setLoading(false)
      return undefined
    }

    fetch(`/api/modpack/${encodeURIComponent(code)}/preview`)
      .then(async (response) => {
        if (response.status === 404) throw new Error('This code does not exist or has expired.')
        if (!response.ok) throw new Error('The code could not be loaded. Please try again later.')
        return response.json()
      })
      .then((result) => {
        if (!active) return
        setPack(result.data)
        const firstFilled = SECTIONS.find((section) => (result.data?.[section.key] || []).length > 0)
        if (firstFilled) setActiveSection(firstFilled.key)
        fetchModrinthDetails(result.data)
          .then((found) => { if (active) setDetails(found) })
          .catch(() => {})
      })
      .catch((fetchError) => {
        if (active) setError(fetchError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [code])

  const sectionItems = useMemo(() => {
    if (!pack) return []
    const needle = query.trim().toLowerCase()
    return (pack[activeSection] || [])
      .map((item) => {
        const version = item.versionId ? details.versions[item.versionId] : null
        const project = details.projects[item.projectId] || (version ? details.projects[version.project_id] : null)
        return {
          ...item,
          displayTitle: project?.title || item.title,
          displayIcon: item.icon || project?.icon_url || null,
          versionNumber: version?.version_number || null,
          slug: project?.slug || item.projectId,
          summary: project?.description || '',
        }
      })
      .filter((item) => !needle
        || item.displayTitle.toLowerCase().includes(needle)
        || (item.fileName || '').toLowerCase().includes(needle))
  }, [pack, activeSection, details, query])

  if (loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6">
          <div className="h-[32rem] animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" />
        </div>
      </PageShell>
    )
  }

  if (error || !pack) {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 text-center sm:px-6">
          <h1 className="text-4xl font-black text-white">Code not found</h1>
          <p className="mt-4 text-gray-400">{error || 'The requested code could not be loaded.'}</p>
          <Link to="/code" className="mt-8 rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">
            Try another code
          </Link>
        </main>
      </PageShell>
    )
  }

  const counts = Object.fromEntries(SECTIONS.map((section) => [section.key, (pack[section.key] || []).length]))
  const activeConfig = SECTIONS.find((section) => section.key === activeSection) || SECTIONS[0]
  const deepLink = `luxclient://modpack?code=${encodeURIComponent(pack.code)}`

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pack.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked (http, permissions) -- the code is visible on the page anyway.
    }
  }

  return (
    <PageShell>
      <main>
        <section className="relative overflow-hidden border-b border-white/5 pb-14 pt-28">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background/80 to-background" />

          <div className="relative mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.5fr_0.8fr] lg:px-12">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/80">Shared Modpack</p>

              <div className="mt-5 flex items-center gap-5">
                {pack.icon ? (
                  <img src={pack.icon} alt="" className="h-20 w-20 shrink-0 rounded-2xl border border-white/10 object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <Package className="h-9 w-9 text-primary" />
                  </div>
                )}
                <h1 className="min-w-0 break-words text-4xl font-black tracking-tight text-white md:text-5xl">{pack.name}</h1>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {pack.loader && (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-primary">{pack.loader}</span>
                )}
                {pack.version && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-gray-300">Minecraft {pack.version}</span>
                )}
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs font-black tracking-[0.2em] text-gray-300">{pack.code}</span>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href={deepLink}
                  onClick={() => setLuxHint(true)}
                  className="rounded-2xl bg-primary px-7 py-4 font-black text-black transition hover:bg-primary-dark"
                >
                  Install in Lux
                </a>
                <button
                  type="button"
                  onClick={copyCode}
                  className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-bold text-white transition hover:border-primary/40 hover:text-primary"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy code'}
                </button>
                {luxHint && (
                  <p className="mt-1 w-full text-sm text-gray-400">
                    Nothing happened?{' '}
                    <Link to="/" className="text-primary underline underline-offset-2 hover:text-primary-dark">
                      Make sure Lux Client is installed
                    </Link>{' '}
                    and running, then try again. You can also enter the code <span className="font-mono text-white">{pack.code}</span> in Lux under Import → Code.
                  </p>
                )}
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/10 bg-surface/70 p-6 backdrop-blur-xl">
              <div className="grid grid-cols-2 gap-4">
                {SECTIONS.map((section) => (
                  <Info key={section.key} label={section.label} value={String(counts[section.key])} />
                ))}
                <Info label="Settings" value={pack.hasSettings ? 'Included' : 'No'} />
              </div>
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-400">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Created {formatDate(pack.created)} · {pack.expires ? `expires ${formatDate(pack.expires)}` : 'never expires'}
                </span>
              </div>
              {pack.live && (
                <p className="mt-3 text-sm text-gray-400">
                  Live modpack: installs from this code update automatically when the pack changes
                  (last update {formatDate(pack.updated)}).
                </p>
              )}
            </aside>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1.5fr_0.8fr] lg:px-12">
          <article className="min-w-0 rounded-[2rem] border border-white/5 bg-surface/50 p-5 md:p-8">
            <div className="flex flex-wrap gap-2">
              {SECTIONS.map((section) => {
                const Icon = section.icon
                const selected = section.key === activeSection
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${selected ? 'bg-primary text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                    <span className={`rounded-md px-1.5 text-xs ${selected ? 'bg-black/15' : 'bg-white/10'}`}>{counts[section.key]}</span>
                  </button>
                )
              })}
            </div>

            {counts[activeSection] > 6 && (
              <div className="relative mt-5">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${activeConfig.label.toLowerCase()}...`}
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none transition focus:border-primary/50"
                />
              </div>
            )}

            <div className="mt-5 space-y-2">
              {sectionItems.length === 0 ? (
                <p className="rounded-2xl border border-white/5 bg-black/20 p-6 text-center text-sm text-gray-500">
                  {counts[activeSection] === 0 ? `No ${activeConfig.label.toLowerCase()} in this code.` : 'Nothing matches your search.'}
                </p>
              ) : sectionItems.map((item, index) => (
                <ContentRow key={`${item.projectId || item.fileName}-${index}`} item={item} modrinthType={activeConfig.modrinthType} />
              ))}
            </div>
          </article>

          <aside className="h-fit rounded-[2rem] border border-white/5 bg-surface/50 p-6 md:p-8">
            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
              <Settings className="h-5 w-5 text-primary" /> Settings
            </h2>
            {pack.hasSettings ? (
              <p className="mt-4 text-sm leading-6 text-gray-300">
                This code includes the creator&apos;s game settings (<span className="font-mono text-white">options.txt</span>): keybinds, video and sound options.
                They are applied to the new instance when you install it.
              </p>
            ) : (
              <p className="mt-4 text-sm leading-6 text-gray-400">
                No game settings are included. The new instance starts with your default Minecraft settings.
              </p>
            )}

            <h2 className="mt-8 text-2xl font-black text-white">How it works</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-400">
              <li>Click <span className="font-bold text-white">Install in Lux</span> — Lux opens with this code filled in.</li>
              <li>Confirm the import. Lux creates a new instance with Minecraft {pack.version || ''} {capitalize(pack.loader)}.</li>
              <li>All mods, packs and shaders are downloaded from Modrinth. The instance can be started once everything is there.</li>
            </ol>
          </aside>
        </section>
      </main>
    </PageShell>
  )
}

function ContentRow({ item, modrinthType }) {
  const modrinthUrl = item.slug ? `https://modrinth.com/${modrinthType}/${encodeURIComponent(item.slug)}` : null

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-black/20 p-3 sm:p-4">
      {item.displayIcon ? (
        <img src={item.displayIcon} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <Package className="h-5 w-5 text-gray-500" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-black text-white">{item.displayTitle}</p>
        <p className="mt-0.5 truncate text-xs text-gray-500">
          {item.versionNumber ? `Version ${item.versionNumber}` : item.versionId ? 'Version pinned' : 'Latest compatible version'}
          {item.fileName ? ` · ${item.fileName}` : ''}
        </p>
      </div>
      {modrinthUrl && (
        <a
          href={modrinthUrl}
          target="_blank"
          rel="noreferrer"
          title="View on Modrinth"
          className="shrink-0 rounded-lg p-2 text-gray-500 transition hover:bg-white/5 hover:text-primary"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  )
}
