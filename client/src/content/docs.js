export const launcherSections = [
  {
    id: 'overview',
    title: 'Overview',
    content: `Lux Client is more than just a Minecraft launcher. It is a premium-feeling platform for players who want a fast, modern experience without fighting old tooling.

### Highlights

- **High performance** with lightweight startup and polished workflows.
- **Modern UI** built around a clean glassmorphism-inspired interface.
- **Integrated mod hub** support for quickly installing content from trusted sources.`,
  },
  {
    id: 'installation',
    title: 'Installation',
    content: `Download the launcher from the main website and install it like a normal desktop application.

> Do not contact official Minecraft support for launcher-specific help. Use the Lux community channels instead.

### Supported ecosystems

- Fabric
- NeoForge
- Forge
- Spigot
- Paper / Velocity
- Quilt

### Fabric setup

For the Fabric version, install **Fabric Loader** first and then copy the Lux Client Core mod jar into your \`/mods\` folder.`,
  },
  {
    id: 'accounts',
    title: 'Accounts',
    content: `Lux Client works with valid Minecraft accounts and supports Microsoft login as the recommended option.

### Adding a Microsoft account

1. Open the account menu in the launcher.
2. Choose **Add Account**.
3. Select **Microsoft Login**.
4. Complete the browser-based authorization flow.`,
  },
  {
    id: 'instances',
    title: 'Instances',
    content: `Instances are isolated Minecraft installations that let you keep different versions and modpacks side by side.

### Creating a new instance

- **Vanilla** for an unmodified setup.
- **Modded** for Fabric, Forge, NeoForge, or Quilt.

### Managing mods

1. Open an instance.
2. Choose **Manage Mods**.
3. Browse content and install new projects directly from the launcher.`,
  },
  {
    id: 'settings',
    title: 'Settings',
    content: `Tune the launcher to match your hardware and play style.

### Common settings

- **Java & Memory** — allocate more RAM for heavier packs.
- **Resolution** — choose your preferred default window size or fullscreen behavior.
- **Quality of life** — keep separate profiles for different styles of play.`,
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    content: `### Game won't start

Make sure you are using the correct Java version for your Minecraft release.

### Authentication problems

Remove and re-add your Microsoft account if login tokens become invalid.

### Still stuck?

Use the Discord server or GitHub issues page for support.`,
  },
  {
    id: 'faq',
    title: 'FAQ',
    content: `### Is Lux Client free?

Yes. Lux Client is completely free to use.

### Can I use offline accounts?

Yes, but Microsoft accounts are recommended for the best compatibility and skin support.`,
  },
  {
    id: 'credits',
    title: 'Credits',
    content: `Lux Client is maintained by a small community-focused team.

- **Fernsehheft**
- **Mobilestars**
- **ItzzMateo**`,
  },
  {
    id: 'downloads',
    title: 'Downloads',
    content: `Grab the latest launcher build from the main website. Windows, Linux, and macOS install paths are all surfaced from the landing page download modal.`,
  },
  {
    id: 'addons',
    title: 'Addons',
    content: `Lux Client supports themes and functionality extensions.

- Browse the **Extension Store** for published community addons.
- Read the **Extension Development Guide** if you want to build your own.`,
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
      { id: 'accounts', label: 'Accounts' },
      { id: 'instances', label: 'Instances' },
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
