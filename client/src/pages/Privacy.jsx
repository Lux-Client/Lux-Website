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

## 6. Lux Account

A Lux Account is **optional**. Lux Client is fully usable without one — you can install, manage and play instances with a Microsoft account alone. Everything in this section only applies if you choose to sign in with a Lux Account.

Signing in uses Google as the identity provider. We receive and store your Google account id, display name, email address and profile picture URL. We never receive your Google password.

Processing is based on the performance of a contract under Art. 6 para. 1 lit. b GDPR — without this data the account features cannot be provided.

### Devices

When you connect Lux Client to your Lux Account, we store one record per device: a randomly generated device id, the device name shown in the launcher, the operating system family, the app version, the time it was last seen, and the IP address of the last request.

You can see all connected devices and disconnect any of them individually — in the launcher under **Settings → Lux Account**, or on this website. Disconnecting a device invalidates its access immediately.

## 7. Lux Cloud Sync

Cloud Sync is **off unless you switch it on for a specific instance**. Nothing is uploaded without you selecting that instance first.

### What is uploaded

- instance configuration (Minecraft version, mod loader, launch settings)
- mod, resource pack and shader pack **file lists**
- configuration files
- your server list
- small mod data such as waypoints and schematics
- playtime per device
- **optionally, and off by default:** worlds and screenshots

### What is not uploaded

- Minecraft itself, libraries, assets and loader files — the receiving PC downloads these again from their original sources
- logs, crash reports, caches, rendered map tiles and temporary files
- **mods, resource packs and shader packs that are available on Modrinth.** For these we store only the project and version identifier. The files themselves are fetched from Modrinth by the receiving PC and never pass through our servers.

### How it is stored

Files are stored content-addressed: each file is identified by its SHA-256 hash. Identical files are stored once and shared between accounts, so a mod file you and another user both have exists only once on our side.

Because deduplication requires the server to recognise identical content, we **cannot offer end-to-end encryption** for cloud instances. Data is encrypted in transit (TLS) and at rest by the storage provider. Every download request is checked against your account before it is served; files belonging to other users are never accessible to you, and yours are never accessible to them.

### Storage location and processors

Cloud data is stored with an object storage provider acting as a processor on our behalf. The concrete provider and region must be named here before launch and are documented in the operator's records of processing activities.

### Retention

- **An instance that is never downloaded on a second PC is removed from the cloud after 15 days.** Lux Cloud exists to move instances between machines; it is not a backup service. You are notified after 8 days, again after 12 days including an email, and once more when the instance is removed.
- After removal the instance stays recoverable for 30 days, then it is deleted permanently.
- Older versions of an instance are thinned out over time: everything from the last 7 days, then one per day for 30 days, then one per month for 90 days, and at most 20 versions per instance.
- Files no longer referenced by any version are deleted at the latest 24 hours after the last reference disappears.

**Your local files are never affected by any of this.** Removal from the cloud never touches the instances on your own PCs.

### Playtime

Playtime is counted per device and summed for the total shown on your account. We store how many milliseconds were played per instance and device — not when you played.

## 8. Deleting Your Data

Two separate options, both available in the launcher under **Settings → Lux Account** and on this website:

- **Delete cloud data** — removes all cloud instances and their files. Your account, your connected devices and your local instances stay.
- **Delete account** — removes your account, all cloud instances and files, all connected devices, your extensions and everything else associated with you. Access tokens stop working immediately, and stored files without any remaining reference are removed within 24 hours. **Your local instances on your own PCs are not touched.**

Account deletion is immediate and cannot be undone.

## 9. Your Rights

You may request access, rectification, erasure, restriction, data portability, or object to processing where applicable.

## 10. Complaints

If you believe your data protection rights are being violated, you may contact the competent supervisory authority.`

export default function Privacy() {
  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
        <header className="mb-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Legal</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Privacy Policy</h1>
          <p className="mt-4 text-gray-400">Last updated: August 31, 2026</p>
        </header>

        <article className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <MarkdownContent content={content} />
        </article>
      </main>
    </PageShell>
  )
}
