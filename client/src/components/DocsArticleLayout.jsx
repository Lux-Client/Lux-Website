import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageShell from './PageShell'
import MarkdownContent from './MarkdownContent'

export default function DocsArticleLayout({ title, description, sections, sidebarGroups }) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id)

  useEffect(() => {
    const onScroll = () => {
      let current = sections[0]?.id
      sections.forEach((section) => {
        const element = document.getElementById(section.id)
        if (element && window.scrollY >= element.offsetTop - 140) {
          current = section.id
        }
      })
      setActiveSection(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections])

  const activeClasses = 'text-primary border-l-2 border-primary pl-3'
  const inactiveClasses = 'text-gray-500 pl-4 hover:text-white transition-colors'

  return (
    <PageShell>
      <div className="max-w-[1600px] mx-auto px-6 pt-28 pb-20 xl:px-10">
        <div className="mb-10 max-w-4xl">
          <Link to="/docs" className="text-xs font-black uppercase tracking-[0.3em] text-primary/80 hover:text-primary">
            Documentation
          </Link>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-400">{description}</p>
        </div>

        <div className="flex gap-10">
          <aside className="sticky top-28 hidden h-[calc(100vh-8rem)] w-72 overflow-y-auto border-r border-white/5 pr-8 lg:block">
            <div className="space-y-10">
              {sidebarGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-gray-500">{group.title}</h3>
                  <div className="space-y-3 text-sm font-semibold">
                    {group.links.map((link) => (
                      <a
                        key={link.id}
                        href={`#${link.id}`}
                        className={activeSection === link.id ? activeClasses : inactiveClasses}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0 flex-1 max-w-5xl">
            <div className="space-y-16">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-32 rounded-[2rem] border border-white/5 bg-surface/40 p-8 backdrop-blur-xl md:p-10">
                  <div className="mb-6 flex items-center gap-4">
                    <span className="text-2xl font-black text-primary">#</span>
                    <h2 className="text-3xl font-black text-white">{section.title}</h2>
                  </div>
                  <MarkdownContent content={section.content} />
                </section>
              ))}
            </div>
          </main>

          <aside className="sticky top-28 hidden h-[calc(100vh-8rem)] w-64 overflow-y-auto pl-2 xl:block">
            <h4 className="mb-6 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">On this page</h4>
            <nav className="space-y-3 text-xs font-bold">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={activeSection === section.id ? 'block text-primary' : 'block text-gray-500 hover:text-white'}
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>
        </div>
      </div>
    </PageShell>
  )
}
