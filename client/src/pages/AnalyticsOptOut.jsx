import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'

const content = `Lux Client only uses anonymous operational statistics. No personal browsing profile is created.

## Launcher information

- Launcher version
- Operating system

## Game session data

- Mod loader or server software
- Minecraft version
- Whether the session is client or server
- Daily launch counters

## Active user data

- Anonymous active launcher count
- Anonymous in-game count
- Aggregated currently played instances

## Download tracking

- Download counts for mods
- Download counts for resource packs
- Download counts for shaders
- Download counts for modpacks

## Modpack codes

When you create or use a share code, the system stores the code payload, usage counter, timestamps, and the owner UUID or IP for rate limiting and expiry.

Website-created codes expire after **5 days**. Launcher account codes expire after **7 days**.

## Opting out

In the Lux Client desktop app, go to **Settings → Privacy** and turn off **"Share anonymous usage data"**. This immediately stops the launcher from sending session data (whether you're playing) and download tracking — no restart required. Functional modpack-code data is retained only when you actively create or use share codes, independent of this setting.`

export default function AnalyticsOptOut() {
  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
        <header className="mb-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Privacy</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Analytics Opt-Out</h1>
          <p className="mt-4 text-gray-400">Manage your data preferences and understand what is counted.</p>
        </header>

        <article className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <MarkdownContent content={content} />
        </article>
      </main>
    </PageShell>
  )
}
