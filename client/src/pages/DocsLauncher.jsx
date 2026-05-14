import DocsArticleLayout from '../components/DocsArticleLayout'
import { launcherSections, launcherSidebarGroups } from '../content/docs'

export default function DocsLauncher() {
  return (
    <DocsArticleLayout
      title="Launcher Documentation"
      description="Everything you need to install Lux Client, manage accounts, build instances, and troubleshoot common issues."
      sections={launcherSections}
      sidebarGroups={launcherSidebarGroups}
    />
  )
}
