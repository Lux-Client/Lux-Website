import { Newspaper, Send, Trash2 } from 'lucide-react'
import { Button, EmptyState, Field, FileInput, Panel, TextArea, TextInput } from '../ui'

/* Editor on the left, live list on the right: writing a post and seeing what is
   already published no longer means scrolling between two stacked blocks. */

export default function NewsView({ news, form, onFormChange, file, onFileChange, onSubmit, onRemove, submitting }) {
  const canPublish = form.title.trim() && form.description.trim()

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel title="New post" description="Published to the launcher news feed and the website immediately.">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Title">
            <TextInput value={form.title} onChange={v => onFormChange({ title: v })} placeholder="What happened?" />
          </Field>
          <Field label="Description">
            <TextArea value={form.description} onChange={v => onFormChange({ description: v })} rows={5} placeholder="A short summary shown under the title." />
          </Field>
          <Field label="Link" hint="Optional — where the post should take readers.">
            <TextInput value={form.link} onChange={v => onFormChange({ link: v })} placeholder="https://…" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Image URL" hint="Or upload a file instead.">
              <TextInput value={form.image} onChange={v => onFormChange({ image: v })} placeholder="https://…" />
            </Field>
            <Field label="Upload image" hint="Overrides the URL above.">
              <FileInput accept="image/*" fileName={file?.name} onChange={onFileChange} />
            </Field>
          </div>

          <Button
            type="submit" size="lg" variant="primary" icon={Send}
            disabled={!canPublish || submitting}
            className="mt-1 w-full"
          >
            {submitting ? 'Publishing…' : 'Publish post'}
          </Button>
        </form>
      </Panel>

      <Panel
        title="Published"
        description={`${news.length} post${news.length === 1 ? '' : 's'} live right now. Newest first.`}
        bodyClass="p-5"
      >
        {news.length === 0 ? (
          <EmptyState icon={Newspaper} title="Nothing published yet" message="The first post you publish shows up here and in the launcher." />
        ) : (
          <div className="flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto pr-1">
            {news.map((item, index) => (
              <article key={`${item.title}-${index}`} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-colors hover:border-white/[0.12]">
                <img
                  src={item.image || '/resources/lux_icon.png?v=3'}
                  alt=""
                  className={`h-14 w-14 shrink-0 rounded-lg border border-white/[0.06] ${item.image ? 'object-cover' : 'bg-white/[0.04] object-contain p-2.5'}`}
                  onError={e => { e.currentTarget.src = '/resources/lux_icon.png?v=3' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/[0.38]">{item.description}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-white/[0.22]">{item.date}</span>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => onRemove(index)}>Delete</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
