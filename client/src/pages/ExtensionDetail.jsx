import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'
import { fixPath } from '../hooks/useAuth'

export default function ExtensionDetail() {
  const { id } = useParams()
  const [extension, setExtension] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadCount, setDownloadCount] = useState(0)

  useEffect(() => {
    let active = true

    fetch(`/api/extensions/i/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Extension not found')
        return response.json()
      })
      .then((data) => {
        if (!active) return
        setExtension(data)
        setDownloadCount(Number(data.downloads || 0))
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
  }, [id])

  const latestVersion = useMemo(() => extension?.versions?.[0] ?? null, [extension])
  const downloadHref = latestVersion?.file_path ? fixPath(latestVersion.file_path) : extension?.file_path ? fixPath(extension.file_path) : ''
  const downloadFileName = useMemo(() => {
    const fp = latestVersion?.file_path || extension?.file_path || ''
    return fp.split('/').pop() || `${extension?.name || 'download'}`
  }, [latestVersion, extension])

  const luxclientUrl = useMemo(() => {
    if (!extension?.identifier || !downloadHref) return ''
    const absoluteUrl = downloadHref.startsWith('http') ? downloadHref : `https://lux.pluginhub.de${downloadHref}`
    return `luxclient://install?identifier=${encodeURIComponent(extension.identifier)}&type=${encodeURIComponent(extension.type || 'extension')}&url=${encodeURIComponent(absoluteUrl)}&name=${encodeURIComponent(extension.name || '')}`
  }, [extension, downloadHref])

  const trackDownload = async () => {
    if (!extension?.id) return
    try {
      await fetch(`/api/extensions/${extension.id}/download`, { method: 'POST' })
      setDownloadCount((count) => count + 1)
    } catch {
      // non-fatal
    }
  }

  const handleDownload = async () => {
    if (!extension?.id || !downloadHref) return
    try {
      await fetch(`/api/extensions/${extension.id}/download`, { method: 'POST' })
      setDownloadCount((count) => count + 1)
      window.open(downloadHref, '_blank', 'noopener,noreferrer')
    } catch {
      window.open(downloadHref, '_blank', 'noopener,noreferrer')
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-32">
          <div className="h-[32rem] animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" />
        </div>
      </PageShell>
    )
  }

  if (error || !extension) {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-4xl font-black text-white">Extension not found</h1>
          <p className="mt-4 text-gray-400">{error || 'The requested extension could not be loaded.'}</p>
          <Link to="/extensions" className="mt-8 rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">
            Back to marketplace
          </Link>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main>
        <section className="relative overflow-hidden border-b border-white/5 pb-16 pt-28">
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `url('${fixPath(extension.banner_path)}')`, backgroundPosition: 'center', backgroundSize: 'cover' }} />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />

          <div className="relative mx-auto grid max-w-7xl gap-8 px-6 lg:grid-cols-[1.5fr_0.8fr] lg:px-12">
            <div>
              <Link to="/extensions" className="text-xs font-black uppercase tracking-[0.3em] text-primary/80 hover:text-primary">
                Extensions
              </Link>
              <h1 className="mt-5 text-5xl font-black tracking-tight text-white md:text-6xl">{extension.name}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-gray-300">{extension.summary || extension.description || 'No summary provided.'}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-primary">{extension.type || 'extension'}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-gray-300">{extension.identifier}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-gray-300">{latestVersion?.version || 'v1.0.0'}</span>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                {downloadHref ? (
                  <>
                    <a
                      href={luxclientUrl || downloadHref}
                      onClick={trackDownload}
                      className="rounded-2xl bg-primary px-7 py-4 font-black text-black transition hover:bg-primary-dark"
                    >
                      Open in Lux
                    </a>
                    <a
                      href={downloadHref}
                      download={downloadFileName}
                      onClick={trackDownload}
                      className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-bold text-white transition hover:border-primary/40 hover:text-primary"
                    >
                      Standalone Download
                    </a>
                  </>
                ) : (
                  <span className="rounded-2xl bg-white/5 px-7 py-4 font-black text-gray-500 opacity-50">
                    Unavailable
                  </span>
                )}
                <a href="#description" className="rounded-2xl border border-white/10 bg-white/5 px-7 py-4 font-bold text-white transition hover:border-primary/40 hover:text-primary">
                  Read Details
                </a>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-white/10 bg-surface/70 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <img src={fixPath(extension.developer_avatar)} alt={extension.developer || 'Developer'} className="h-16 w-16 rounded-2xl border border-white/10 object-cover" />
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Developer</p>
                  <h2 className="mt-2 text-2xl font-black text-white">{extension.developer || 'Unknown'}</h2>
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Info label="Downloads" value={downloadCount.toLocaleString()} />
                <Info label="Released" value={new Date(extension.created_at).toLocaleDateString('de-DE')} />
                <Info label="Updated" value={new Date(extension.updated_at || extension.created_at).toLocaleDateString('de-DE')} />
                <Info label="Versions" value={String(extension.versions?.length || (extension.file_path ? 1 : 0))} />
              </div>
            </aside>
          </div>
        </section>

        <section id="description" className="mx-auto grid max-w-7xl gap-8 px-6 py-16 lg:grid-cols-[1.5fr_0.8fr] lg:px-12">
          <article className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
            <h2 className="mb-6 text-3xl font-black text-white">Overview</h2>
            <MarkdownContent content={extension.description || 'No description provided.'} />
          </article>

          <aside className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
            <h2 className="text-2xl font-black text-white">Version History</h2>
            <div className="mt-6 space-y-4">
              {(extension.versions?.length ? extension.versions : [{ version: latestVersion?.version || 'v1.0.0', created_at: extension.created_at, downloads: extension.downloads || 0 }]).slice(0, 5).map((version, index) => (
                <div key={`${version.version}-${index}`} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className={`text-lg font-black ${index === 0 ? 'text-primary' : 'text-white'}`}>{version.version}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">{new Date(version.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Downloads</p>
                      <p className="mt-1 text-lg font-black text-white">{Number(version.downloads || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </PageShell>
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
