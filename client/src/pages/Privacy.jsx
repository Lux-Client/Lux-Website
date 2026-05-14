import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'

const content = `## 1. Introduction

The operator of this website and Lux Client treats personal data protection seriously. This page explains which data may be processed, why it is processed, and which rights users have under the GDPR.

## 2. Controller

The controller details currently use placeholder information and still need to be replaced by the actual operator contact data.

> Contact email: **info@pluginhub.de**

## 3. Data Collection on Our Website

### Server log files

The hosting provider may automatically process technical information such as browser type, operating system, referrer, hostname, request time, and IP address.

This information is not merged with other datasets and is processed on the basis of legitimate interest under Art. 6 para. 1 lit. f GDPR.

## 4. Analysis Tools

We use anonymized statistics to understand how Lux Client is used and to improve reliability. No personal usage profiles are created.

You can review the tracking scope on the **Opt-Out** page.

## 5. Lux Client Launcher

The launcher communicates with third-party services such as:

- **Mojang / Microsoft** for authentication and game files
- **Modrinth** for searching and downloading mods
- **Crafatar** for rendering skins and avatars

Lux Client itself does not store Microsoft passwords; authentication uses the providers' secure OAuth flows.

## 6. Your Rights

You may request access, rectification, erasure, restriction, data portability, or object to processing where applicable.

## 7. Complaints

If you believe your data protection rights are being violated, you may contact the competent supervisory authority.`

export default function Privacy() {
  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
        <header className="mb-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Legal</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Privacy Policy</h1>
          <p className="mt-4 text-gray-400">Last updated: March 02, 2026</p>
        </header>

        <article className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <MarkdownContent content={content} />
        </article>
      </main>
    </PageShell>
  )
}
