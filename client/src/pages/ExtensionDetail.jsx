import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Flag, MessageSquare, Send, Star, Trash2 } from 'lucide-react'
import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'
import useAuth, { fixPath } from '../hooks/useAuth'

export default function ExtensionDetail() {
  const { id } = useParams()
  const auth = useAuth()
  const [extension, setExtension] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadCount, setDownloadCount] = useState(0)

  const [ratingData,     setRatingData]     = useState({ average: 0, count: 0, yourRating: null })
  const [comments,        setComments]        = useState([])
  const [commentText,     setCommentText]     = useState('')
  const [postingComment,  setPostingComment]  = useState(false)
  const [commentError,    setCommentError]    = useState('')
  const [reportTarget,    setReportTarget]    = useState(null)

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

  useEffect(() => {
    if (!extension?.id) return
    fetch(`/api/extensions/${extension.id}/ratings`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRatingData(d) })
      .catch(() => {})
    fetch(`/api/extensions/${extension.id}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setComments(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [extension?.id])

  const submitRating = async value => {
    if (!auth.loggedIn || !extension?.id) return
    const res = await fetch(`/api/extensions/${extension.id}/ratings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: value }),
    })
    if (res.ok) {
      const r = await fetch(`/api/extensions/${extension.id}/ratings`)
      if (r.ok) setRatingData(await r.json())
    }
  }

  const submitComment = async e => {
    e.preventDefault()
    if (!commentText.trim() || !extension?.id || postingComment) return
    setPostingComment(true)
    setCommentError('')
    try {
      const res  = await fetch(`/api/extensions/${extension.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setComments(list => [data.comment, ...list])
        setCommentText('')
      } else {
        setCommentError(data.error || 'Failed to post comment.')
      }
    } finally {
      setPostingComment(false)
    }
  }

  const deleteComment = async commentId => {
    if (!window.confirm('Delete this comment?')) return
    const res = await fetch(`/api/extensions/comments/${commentId}`, { method: 'DELETE' })
    if (res.ok) setComments(list => list.filter(c => c.id !== commentId))
  }

  const submitReport = async reason => {
    if (!reportTarget) return { success: false, error: 'Nothing to report' }
    const res  = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: reportTarget.type, targetId: reportTarget.id, reason }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) setReportTarget(null)
    return { success: res.ok && !!data.success, error: data.error }
  }

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

  const [luxHint, setLuxHint] = useState(false)

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

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <StarRating
                  average={ratingData.average}
                  count={ratingData.count}
                  yourRating={ratingData.yourRating}
                  interactive={auth.loggedIn}
                  onRate={submitRating}
                />
                <button
                  onClick={() => setReportTarget({ type: 'extension', id: extension.id })}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-red-400"
                >
                  <Flag className="h-3.5 w-3.5" /> Report
                </button>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-primary">{extension.type || 'extension'}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-gray-300">{extension.identifier}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-gray-300">{latestVersion?.version || 'v1.0.0'}</span>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                {downloadHref ? (
                  <>
                    <a
                      href={luxclientUrl || downloadHref}
                      onClick={() => { trackDownload(); setLuxHint(true); }}
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
                    {luxHint && (
                      <p className="w-full text-sm text-gray-400 mt-1">
                        Nothing happened?{' '}
                        <a href="https://lux.pluginhub.de" className="text-primary underline underline-offset-2 hover:text-primary-dark">
                          Make sure Lux Client is installed
                        </a>{' '}
                        and running, then try again.
                      </p>
                    )}
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
              {extension.developer ? (
                <Link to={`/u/${extension.developer}`} className="group flex items-center gap-4">
                  <img src={fixPath(extension.developer_avatar)} alt={extension.developer} className="h-16 w-16 rounded-2xl border border-white/10 object-cover" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Developer</p>
                    <h2 className="mt-2 text-2xl font-black text-white transition-colors group-hover:text-primary">{extension.developer}</h2>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-4">
                  <img src={fixPath(extension.developer_avatar)} alt="Developer" className="h-16 w-16 rounded-2xl border border-white/10 object-cover" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Developer</p>
                    <h2 className="mt-2 text-2xl font-black text-white">Unknown</h2>
                  </div>
                </div>
              )}

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

        <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-12">
          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-black text-white">
              <MessageSquare className="h-5 w-5 text-primary" />
              Comments <span className="text-gray-500">({comments.length})</span>
            </h2>

            {auth.loggedIn ? (
              <form onSubmit={submitComment} className="mb-8 flex flex-col gap-2">
                <textarea
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Share your thoughts on this project…"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-gray-600">{commentText.length}/1000</span>
                  <button
                    type="submit"
                    disabled={!commentText.trim() || postingComment}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black transition hover:bg-primary-dark disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" /> {postingComment ? 'Posting…' : 'Post comment'}
                  </button>
                </div>
                {commentError && <p className="text-xs font-semibold text-red-400">{commentError}</p>}
              </form>
            ) : (
              <p className="mb-8 text-sm text-gray-500">
                <a href={auth.loginUrl} className="text-primary underline underline-offset-2 hover:text-primary-dark">Sign in</a> to leave a comment.
              </p>
            )}

            {comments.length === 0 ? (
              <p className="text-sm text-gray-600">No comments yet. Be the first to share your thoughts.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {comments.map(comment => {
                  const canDelete = auth.user && (auth.user.id === comment.user_id || auth.user.role === 'admin' || auth.user.id === extension.user_id)
                  return (
                    <div key={comment.id} className="flex gap-3 border-b border-white/5 pb-5 last:border-0 last:pb-0">
                      <img
                        src={fixPath(comment.avatar)}
                        alt={comment.username}
                        className="h-10 w-10 shrink-0 rounded-xl border border-white/10 object-cover"
                        onError={e => { e.currentTarget.src = '/resources/lux_icon.png?v=3' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Link to={`/u/${comment.username}`} className="text-sm font-bold text-white hover:text-primary">{comment.username}</Link>
                            <span className="text-xs text-gray-600">{new Date(comment.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {auth.loggedIn && (
                              <button
                                onClick={() => setReportTarget({ type: 'comment', id: comment.id })}
                                className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 transition-colors hover:text-red-400"
                              >
                                <Flag className="h-3 w-3" /> Report
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 transition-colors hover:text-red-400"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">{comment.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      {reportTarget && (
        <ReportModal
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onSubmit={submitReport}
        />
      )}
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

function StarRating({ average, count, yourRating, interactive, onRate }) {
  const [hover, setHover] = useState(0)
  const display = hover || yourRating || Math.round(average)

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            disabled={!interactive}
            onMouseEnter={() => interactive && setHover(n)}
            onClick={() => interactive && onRate(n)}
            className={`p-0.5 ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
            title={interactive ? `Rate ${n} star${n > 1 ? 's' : ''}` : undefined}
          >
            <Star className={`h-4 w-4 ${n <= display ? 'fill-primary text-primary' : 'text-gray-600'}`} />
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500">
        {average > 0 ? average.toFixed(1) : '–'} ({count} rating{count !== 1 ? 's' : ''})
      </span>
    </div>
  )
}

function ReportModal({ target, onClose, onSubmit }) {
  const [reason, setReason]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!reason.trim()) return
    setSubmitting(true); setError('')
    const result = await onSubmit(reason.trim())
    setSubmitting(false)
    if (!result.success) setError(result.error || 'Failed to submit report.')
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
      >
        <h3 className="mb-1 text-lg font-bold text-white">Report {target.type === 'comment' ? 'comment' : 'extension'}</h3>
        <p className="mb-4 text-sm text-gray-500">Tell us what's wrong. Our moderators will take a look.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            maxLength={500}
            required
            placeholder="e.g. this file contains malware, this comment is spam…"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-red-400/50 focus:ring-1 focus:ring-red-400/20"
          />
          {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/60 transition hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !reason.trim()} className="rounded-xl bg-red-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-40">
              {submitting ? 'Sending…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
