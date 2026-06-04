import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Hash } from 'lucide-react'
import PageShell from './PageShell'
import MarkdownContent from './MarkdownContent'

export default function DocsArticleLayout({ title, description, sections, sidebarGroups }) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id)

  useEffect(() => {
    const getTop = el => el.getBoundingClientRect().top + window.scrollY
    const onScroll = () => {
      let current = sections[0]?.id
      sections.forEach(s => {
        const el = document.getElementById(s.id)
        if (el && window.scrollY >= getTop(el) - 150) current = s.id
      })
      setActiveSection(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections])

  return (
    <PageShell>
      <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-24 lg:px-10">

        {/* Breadcrumb + header */}
        <div className="mb-10 max-w-3xl">
          <Link
            to="/docs"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white/30 transition-colors hover:text-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Documentation
          </Link>
          <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-base text-white/40">{description}</p>
        </div>

        <div className="flex gap-8">

          {/* Left sidebar — section groups */}
          <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-56 shrink-0 overflow-y-auto lg:block">
            <div className="flex flex-col gap-8">
              {sidebarGroups.map(group => (
                <div key={group.title}>
                  <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">
                    {group.title}
                  </h3>
                  <div className="flex flex-col gap-0.5">
                    {group.links.map(link => (
                      <a
                        key={link.id}
                        href={`#${link.id}`}
                        className={`rounded-lg py-1.5 text-sm font-medium transition-colors ${
                          activeSection === link.id
                            ? 'border-l-2 border-primary pl-3 text-primary'
                            : 'pl-3.5 text-white/35 hover:text-white'
                        }`}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Main content */}
          <main className="min-w-0 flex-1">
            <div className="flex flex-col gap-6">
              {sections.map(section => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-28 rounded-2xl border border-white/6 bg-[#0f0f0f] p-6 md:p-8"
                >
                  <div className="mb-5 flex items-center gap-2.5">
                    <Hash className="h-4 w-4 shrink-0 text-primary/60" />
                    <h2 className="text-xl font-bold text-white">{section.title}</h2>
                  </div>
                  <MarkdownContent content={section.content} />
                </section>
              ))}
            </div>
          </main>

          {/* Right sidebar — on this page */}
          <aside className="sticky top-24 hidden h-[calc(100vh-7rem)] w-48 shrink-0 overflow-y-auto xl:block">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/20">On this page</p>
            <div className="flex flex-col gap-1">
              {sections.map(section => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={`rounded-lg py-1 pl-3 text-xs font-medium transition-colors ${
                    activeSection === section.id ? 'text-primary' : 'text-white/30 hover:text-white'
                  }`}
                >
                  {section.title}
                </a>
              ))}
            </div>
          </aside>

        </div>
      </div>
    </PageShell>
  )
}
