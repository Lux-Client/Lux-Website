import DocsArticleLayout from '../components/DocsArticleLayout'
import { extensionSections, extensionSidebarGroups } from '../content/docs'

export default function DocsExtension() {
  return (
    <DocsArticleLayout
      title="Extension Development Guide"
      description="Build, package, and ship custom Lux Client extensions with the same workflow used by the legacy marketplace."
      sections={extensionSections}
      sidebarGroups={extensionSidebarGroups}
    />
  )
}
