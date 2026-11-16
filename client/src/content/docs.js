export const launcherSections = [
  {
    id: 'overview',
    title: 'Overview',
    content: `Lux Client is a free Minecraft launcher for Windows, macOS and Linux, with its own Fabric mod for in-game cosmetics.

### What you can do

- **Instances** for Vanilla, Fabric, Forge, NeoForge and Quilt, side by side.
- **Mods, modpacks, resource packs and shaders** from Modrinth and CurseForge, installed from inside the launcher.
- **Modpack codes** to hand a whole instance to a friend with one short code.
- **Lux Cloud** to move instances between your PCs.
- **Servers**: create, start and watch Paper, Purpur, Fabric and other servers with a live console.
- **Skins** with a 3D preview and a skin editor.
- **Themes and extensions** from the marketplace, plus 15 languages.
- **The Lux Client mod** for capes, wings, name styles and the cosmetics shop in game.

Most of this works without any account. A free [Lux Account](#lux-account) is only needed for Lux Cloud, cosmetics, capes and publishing extensions.`,
  },
  {
    id: 'installation',
    title: 'Installation',
    content: `Download the launcher from the **Download** button on this website, or install it from a terminal:

\`\`\`bash
# Linux & macOS
curl -sSL https://lux.pluginhub.de/install.sh | bash
\`\`\`

\`\`\`powershell
# Windows (PowerShell)
iwr https://lux.pluginhub.de/install.ps1 | iex
\`\`\`

### Supported platforms

| Platform | Package |
| --- | --- |
| Windows | Installer (x64) |
| macOS | DMG for Apple Silicon and Intel |
| Linux | AppImage, DEB, RPM |

The launcher updates itself. When a new version is out, it is downloaded in the background and installed on the next start.

> Please don't contact Mojang or Microsoft support about launcher problems. Use the Lux Discord or GitHub instead.`,
  },
  {
    id: 'lux-account',
    title: 'Lux Account',
    content: `A Lux Account is your account on this website. It is separate from your Minecraft account and optional: you only need it for Lux Cloud, cosmetics, capes and publishing extensions.

### Creating an account

Go to [Sign up](/register) and choose one of two ways:

- **Email and password.** Pick a username, enter your email and a password with at least 8 characters. We send you a confirmation link that is valid for 24 hours; your account works once you open it.
- **Google.** One click, no password needed. If an email account with the same address already exists, Google is linked to it.

### Signing in

On [Sign in](/login) you can use your email and password, a **passkey**, or Google. To connect the launcher, open **Settings → Lux Account** in the launcher and sign in; the browser opens, you confirm the device, and the launcher is linked.

### Forgot your password?

Use [Forgot password](/forgot-password). You get a link that is valid for 1 hour and works once. Changing the password signs out your other browsers. This also works to add a password to an account you created with Google.

### Two-factor authentication

Under **Profile → Sign-in and security** you can turn on extra protection:

- **Authenticator app (2FA).** Scan the QR code with an app like Google Authenticator, Aegis, 1Password or Authy. From then on, signing in asks for the 6-digit code after your password, and also after Google sign-in.
- **Passkeys.** Sign in with your fingerprint, face or device PIN instead of a password. A passkey also counts as your second factor.
- **Recovery codes.** When you turn on 2FA or add your first passkey you get 10 one-time codes. Keep them safe: they are the way back in if you lose your phone.

### Limits and protection

To keep accounts safe, sign-in, sign-up and email requests are rate limited, and an account is locked for 15 minutes after several wrong passwords in a row.

We send account emails through a free email service with a daily and monthly limit. In the rare case that limit is reached, sign-up with email and password reset emails pause until the next day (or the next month). Signing in, and signing up with Google, keep working.`,
  },
  {
    id: 'accounts',
    title: 'Minecraft Accounts',
    content: `To play you need a Minecraft account. A Microsoft account is recommended; offline accounts work too, but without skins and online servers.

### Adding a Microsoft account

1. Open the account menu in the top bar of the launcher.
2. Choose **Add Account** and then **Microsoft**.
3. Sign in in the browser window that opens.

You can add several accounts and switch between them in the same menu.`,
  },
  {
    id: 'instances',
    title: 'Instances',
    content: `An instance is its own Minecraft installation with its own version, loader, mods, worlds and settings. Instances never affect each other.

### Creating an instance

Click **New Instance** in the library and choose:

- **Manual Setup**: pick a Minecraft version and a loader (Vanilla, Fabric, Forge, NeoForge or Quilt). On supported Fabric versions you can choose between a **Standalone Instance** and **With Lux Client** (see [Lux Client Mod](#lux-mod)).
- **Import from File**: a modpack file, for example a \`.mrpack\` from Modrinth or a CurseForge zip.
- **Import from Code**: an 8-character [modpack code](#modpack-codes) from a friend.

Modpacks can also be installed straight from the Modrinth and CurseForge search in the launcher.

### Inside an instance

| Tab | What it does |
| --- | --- |
| Content | Mods, resource packs and shaders. Install, update, enable or remove them. |
| Worlds | Your singleplayer worlds. |
| Logs | \`latest.log\` and older game logs. |
| Screenshots | Everything you captured in game. |
| Files | The instance folder. |

### Instances from other launchers

Lux finds instances from the **Modrinth App** and **CurseForge** and shows them in your library. They start with the right version and loader. Right-click one and choose **Convert to Lux instance** to make a copy that Lux fully manages; the original stays untouched as a backup.`,
  },
  {
    id: 'modpack-codes',
    title: 'Modpack Codes',
    content: `A modpack code is an 8-character code (letters and digits) that lets a friend rebuild your instance with one click.

### Sharing an instance

Right-click the instance in your library and choose **Export → Export as Code**. The code contains the Minecraft version, the loader, and the list of mods, resource packs and shaders. Mods are downloaded by your friend from Modrinth or CurseForge, so codes stay small.

### Using a code

In the launcher, choose **New Instance → Import from Code** and enter it. On the website you can [preview a code](/code) first to see what is inside before installing anything.

Codes expire after a few days. Create a new one if your friend needs it later.`,
  },
  {
    id: 'lux-mod',
    title: 'Lux Client Mod',
    content: `The Lux Client mod is a Fabric mod that brings Lux into the game: capes, wings, shields, name styles, the cosmetics shop, Lux friends and an in-game menu (Right Shift).

### Supported versions

Fabric on Minecraft **1.20.1, 1.21.1, 1.21.8, 1.21.11, 26.1, 26.2 and 26.3**.

### Installing it

- When you create a Fabric instance on a supported version, choose **With Lux Client**. The mod is then part of the instance and kept up to date.
- For an existing instance, use the **Lux Client** button in the library and pick the instance, or click **Install Lux Client** on the banner that appears for matching instances.
- After installing, restart the game.

The jar files are also published on GitHub if you want to install the mod into another launcher by hand.

### Cosmetics

Cosmetics are bought with Lux Credits in the shop and are tied to your Minecraft account. Link it to your [Lux Account](#lux-account) to manage them on the [Capes](/capes) page.`,
  },
  {
    id: 'cloud-sync',
    title: 'Cloud Sync',
    content: `Cloud Sync lets an instance follow you between PCs. It needs a **Lux Account**, which is optional — Lux Client works fully without one.

### How it works

Sign in under **Settings → Lux Account** (see [Lux Account](#lux-account)), then open an instance and switch on Cloud Sync in its **Cloud** tab. On another PC, sign in with the same account and download the instance from the dashboard.

Before each launch Lux checks whether your local files still match the cloud. If they do, the game starts immediately. If the cloud is newer, the instance is updated first. If both sides changed, you are asked which version to keep — and the other one is saved as a backup either way.

### What gets synced

| Synced | Not synced |
| --- | --- |
| Instance settings, version, loader | Minecraft, libraries, assets |
| Mods, resource packs, shaders | Logs, crash reports, caches |
| Config files | Rendered map tiles |
| Server list, waypoints, schematics | Anything re-downloadable |
| Playtime | |
| Worlds and screenshots *(optional)* | |

Mods from Modrinth are **not uploaded at all**. Lux only remembers which mod and version it was, and the other PC fetches it straight from Modrinth. That is why a 17 GB instance often needs less than 150 MB of your storage.

### Limits

- **5 GB** of cloud storage per account
- **10** cloud instances per account
- Worlds are off by default — they are large and the most common source of conflicts

### The 15-day rule

Lux Cloud is a way to move instances **between** PCs, not a backup service. An instance that is never downloaded or used on a second PC is removed from the cloud after 15 days.

You get a notification after 8 days, a second one plus an email after 12, and another when it is removed. After removal you can still restore it for 30 days.

**Your local files are never touched.** Removal from the cloud only affects the cloud copy — the instance on your PC stays exactly as it is. Any activity from a second PC resets the countdown.

### Deleting your data

Under **Settings → Lux Account** you can either delete just your cloud data, keeping your account and devices, or delete your Lux Account entirely. Neither one touches the instances on your PCs.`,
  },
  {
    id: 'servers',
    title: 'Servers',
    content: `Lux can run Minecraft servers on your PC, for example to play with friends on your network.

1. Open the **Servers** section and create a server.
2. Pick the software (Paper, Purpur, Fabric and more) and the version.
3. Start it. The live console shows the output, and crashes are detected and explained.

Plugins and mods for the server can be searched and installed from the launcher as well.`,
  },
  {
    id: 'settings',
    title: 'Settings',
    content: `The most useful settings at a glance:

| Setting | What it does |
| --- | --- |
| Memory Allocation | Minimum and maximum RAM for the game. Heavy modpacks need more. |
| Java Performance Profile | Aikar's Flags are recommended for most modded instances to reduce stutter. |
| Discord Rich Presence | Show what you are playing on Discord. |
| Auto-upload logs on crash | Uploads the log to mclo.gs when the game crashes, so you can share a link for help. |
| Enable Optimizations | Installs performance mods automatically when you create a new instance. |
| Share anonymous usage data | Counts active players and downloads. Turn it off to send nothing. |
| Lux Account | Connect or disconnect the launcher from your Lux Account, and manage Lux Cloud. |

Themes, colours and the layout live under **Styling**.`,
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    content: `### The game won't start

- Make sure the instance has enough memory, but not more than half of your PC's RAM.
- Check **Settings → Java Runtime**. Current Minecraft versions need Java 21 or newer; the launcher can install the right Java for you.
- Open the **Logs** tab of the instance. With **Auto-upload logs on crash** turned on, you get an mclo.gs link you can share.

### A mod crashes the game

Disable recently added mods in the **Content** tab one by one, or check the crash report for the mod name.

### Microsoft sign-in fails

Remove the account in the account menu and add it again.

### I can't sign in to my Lux Account

Use [Forgot password](/forgot-password). If you lost your 2FA device, sign in with one of your recovery codes and set up 2FA again.

### Still stuck?

Ask in the [Discord](https://pluginhub.de/discord.html) or open an issue on [GitHub](https://github.com/Lux-Client/Lux-Client/issues).`,
  },
  {
    id: 'faq',
    title: 'FAQ',
    content: `### Is Lux Client free?

Yes, the launcher and the mod are free. Lux Credits for cosmetics are optional.

### Do I need a Lux Account?

No. You only need one for Lux Cloud, cosmetics, capes and publishing extensions.

### Do I need a Google account for a Lux Account?

No. You can sign up with any email address and a password, or use a passkey.

### Can I use offline accounts?

Yes, but a Microsoft account is recommended for skins and online servers.

### Can I keep using the Modrinth App or CurseForge?

Yes. Lux shows their instances in its library and can convert them to Lux instances without touching the originals.`,
  },
  {
    id: 'credits',
    title: 'Credits',
    content: `Lux Client is maintained by a small community-focused team.

- **Fernsehheft**
- **Mobilestars**
- **ItzzMateo**

Thanks to everyone who translates, reports bugs and builds themes and extensions.`,
  },
  {
    id: 'downloads',
    title: 'Downloads',
    content: `Get the latest launcher with the **Download** button at the top of this page, or from the [GitHub releases](https://github.com/Lux-Client/Lux-Client/releases). Windows, macOS and Linux builds are published with every release, and the launcher keeps itself up to date after that.`,
  },
  {
    id: 'addons',
    title: 'Addons',
    content: `Lux Client supports **themes** and **extensions** made by the community.

- Browse the [Extension Store](/extensions) or the theme marketplace inside the launcher.
- Want to build your own? Read the [Extension Development Guide](/docs/extension).
- Publishing needs a [Lux Account](#lux-account); uploads are reviewed before they go live.`,
  },
]

export const launcherSidebarGroups = [
  {
    title: 'General',
    links: [
      { id: 'overview', label: 'Overview' },
      { id: 'faq', label: 'FAQ' },
      { id: 'credits', label: 'Credits' },
      { id: 'downloads', label: 'Downloads' },
      { id: 'addons', label: 'Addons' },
    ],
  },
  {
    title: 'Wiki',
    links: [
      { id: 'installation', label: 'Installation' },
      { id: 'lux-account', label: 'Lux Account' },
      { id: 'accounts', label: 'Minecraft Accounts' },
      { id: 'instances', label: 'Instances' },
      { id: 'modpack-codes', label: 'Modpack Codes' },
      { id: 'lux-mod', label: 'Lux Client Mod' },
      { id: 'cloud-sync', label: 'Cloud Sync' },
      { id: 'servers', label: 'Servers' },
      { id: 'settings', label: 'Settings' },
      { id: 'troubleshooting', label: 'Troubleshooting' },
    ],
  },
]

export const extensionSections = [
  {
    id: 'structure',
    title: 'File Structure',
    content: `An extension is a ZIP-style package that contains a minimal root structure:

\`\`\`
my-extension/
├── manifest.json
├── main.js
└── other files...
\`\`\`

Both **manifest.json** and **main.js** are required.`,
  },
  {
    id: 'manifest',
    title: 'manifest.json',
    content: `The manifest defines how Lux Client discovers and labels your extension.

\`\`\`json
{
  "id": "my-awesome-extension",
  "name": "My Awesome Extension",
  "version": "1.0.0",
  "description": "Adds a cool new feature.",
  "author": "YourName",
  "main": "main.js"
}
\`\`\``,
  },
  {
    id: 'mainjs',
    title: 'main.js Hooks',
    content: `The runtime expects your entry file to expose specific lifecycle hooks.

- **activate(api)** — called when the extension starts.
- **deactivate()** — called when it is disabled or unloaded.

\`\`\`js
exports.activate = async (api) => {
  api.ui.toast('Extension loaded!', 'success')
  api.ui.registerView('sidebar.bottom', () => {
    return React.createElement('div', null, 'Hello!')
  })
}
\`\`\``,
  },
  {
    id: 'api',
    title: 'Extension API',
    content: `### api.ui

- \`toast(message, type)\`
- \`registerView(slot, component)\`

### api.storage

- \`get(key)\`
- \`set(key, value)\`

The exact surface can evolve, so keep your extensions defensive and version-aware.`,
  },
  {
    id: 'packaging',
    title: 'Packaging',
    content: `1. Select the contents of your extension folder.
2. Compress them into a ZIP file.
3. Optionally rename the archive to use a custom extension such as \`.mcextension\`.

Keep the root structure clean so the launcher can discover the manifest without extra nesting.`,
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    content: `### Extension does not load

Double-check the root file structure and make sure your manifest points to the right entry file.

### UI hook does not render

Verify the slot name and confirm that your render function returns a valid React element.

### Packaging errors

Avoid nested directories inside the archive unless your extension explicitly expects them.`,
  },
]

export const extensionSidebarGroups = [
  {
    title: 'Development',
    links: extensionSections.map((section) => ({ id: section.id, label: section.title })),
  },
]
