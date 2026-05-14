import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'

const content = `## Information according to Section 5 TMG

John Doe  
Sample Street 1  
12345 Sample City  
Germany

> These details are placeholders and still need to be replaced by the actual operator.

## Contact

- Phone: +49 (0) 123 44 55 66
- Email: info@pluginhub.de

## Responsible for content according to Section 55 Abs. 2 RStV

John Doe  
Sample Street 1  
12345 Sample City  
Germany`

export default function Imprint() {
  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
        <header className="mb-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Legal</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Imprint</h1>
        </header>

        <article className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <MarkdownContent content={content} />
        </article>
      </main>
    </PageShell>
  )
}
