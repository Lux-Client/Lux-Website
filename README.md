<div align="center">
  <img src="resources/icon.png" alt="Lux Client Logo" width="128" />
  <h1><strong>Lux Client Website • lux.pluginhub.de</strong></h1>

  <p>
    <em>
      <b>This</b> is the official web platform for <b>Lux Client</b>, offering features for users, extension developers, and admin moderators.<br />
      Discover, submit, review, and manage extensions, as well as stay up to date with the latest news and analytics from the Lux Client community!
    </em>
  </p>
</div>

---

## What is Lux Client?

Lux Client is a cutting-edge Minecraft launcher and platform. Its Website is the central location for:

- Browsing and downloading community and official extensions/plugins.
- Checking the latest news and events.
- Administering and reviewing extension submissions.
- Viewing live analytics and stats for the launcher and its ecosystem.

---

## Main Features

- **Plugin & Extension Gallery:** Discover and download a wide range of game extensions, resourcepacks, and shaders compatible with Lux Client.
- **Extension Submission & Approval:** Submit your own extensions or mods, and have them reviewed by Lux moderators.
- **Admin Panel:** Secure dashboard for moderators to review, approve/reject, and manage all submitted content.
- **News Center:** Stay updated with announcements and news directly from the Lux team.
- **Live Analytics:** See stats on downloads and usage across the Lux Client ecosystem (when enabled).
- **Modern UI:** Built with React and Tailwind CSS for a fluid user and moderator experience.
- **Secure Authentication:** Google-based OAuth for users and admins.

---

## Getting Started as a Developer

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [npm](https://www.npmjs.com/)

### Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Lux-Client/LLux-Website.git
   cd Lux-Website
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up your environment variables:**

   - Copy `.env.example` to `.env` and add your secrets (Google OAuth keys, MySQL config, etc).
   - For fast local development or testing (no database required, analytics/statistics in-memory only):

     ```bash
     npm run dev
     ```

     - Local dev server runs on [http://localhost:3001](http://localhost:3001).
   - For full production functionality (Google auth, database, etc):

     ```bash
     npm start
     ```

---

## Platform Usage

- **Plugin Gallery:** Visit the homepage to browse or search for plugins, extensions, resourcepacks, or shaders.
- **Extension Submissions:** To submit a new extension or  theme, use the submission page (login required).
- **Admin Dashboard:** Accessible at `/admin` (Google login and admin permissions required) – manage submissions, approve, reject, or update extensions. Not for users like you - Moderator / ADmin Only
- **News:** Find the latest announcements on the News page.
- **Live Analytics:** (DEV mode) for admins, live usage and download stats can be viewed.

---

## Tech Stack

- **Express.js** – Backend server and API
- **React** – User/admin UI (extensions, approval flows, news)
- **Tailwind CSS** – Modern styles
- **Socket.IO** – Real-time analytics/live updates
- **Passport** – Google OAuth login and secure authentication
- **MySQL** – Data storage (extensions, users, news) in production

---

## Development

- No database or API keys are required for development: `npm run dev` starts an in-memory server safe for local UI/feature testing.
- All UI (user and admin) lives in the `html/` directory and static/public resources.
- For full-stack testing (OAuth, MySQL, etc), configure `.env` and use `npm start`.

---

## Contributors

- Fernsehheft
- Mobilestars
- ItzzMateo
- Tamino112
- Foxof7207
- blaxk

---

## Screenshots

Screenshots coming soon! Want to contribute screenshots or UX feedback? Open an issue or a pull request.

---

## Support

For questions, bug reports, or feature requests, [create an issue](https://github.com/Lux-Client/LuxClient-News-Admin/issues).  
For discussion, join the main Lux Client community at [Lux Client GitHub Discussions](https://github.com/Lux-Client/LuxClient/discussions).

---

