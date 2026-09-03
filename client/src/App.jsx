import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import ScrollManager from './components/ScrollManager'
import AdminPanel from './pages/AdminPanel'
import AnalyticsOptOut from './pages/AnalyticsOptOut'
import AuthorizeDevice from './pages/AuthorizeDevice'
import LinkDevice from './pages/LinkDevice'
import Changelog from './pages/Changelog'
import Dashboard from './pages/Dashboard'
import DeveloperHome from './pages/DeveloperHome'
import DeveloperProfile from './pages/DeveloperProfile'
import Docs from './pages/Docs'
import DocsExtension from './pages/DocsExtension'
import DocsLauncher from './pages/DocsLauncher'
import ExtensionDetail from './pages/ExtensionDetail'
import Extensions from './pages/Extensions'
import Imprint from './pages/Imprint'
import LandingPage from './pages/LandingPage'
import Maintenance from './pages/Maintenance'
import ModpackEditor from './pages/ModpackEditor'
import Privacy from './pages/Privacy'
import Profile from './pages/Profile'
import ProjectEditor from './pages/ProjectEditor'

// Publishing moved under /developer, but the old URLs are in bookmarks, emails
// and older builds of the launcher, so they keep working as redirects.
function RedirectToEditor() {
  const { id } = useParams()
  return <Navigate to={`/developer/projects/${id}/edit`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/extensions" element={<Extensions />} />
        <Route path="/extensions/:id" element={<ExtensionDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Developer area */}
        <Route path="/developer" element={<Navigate to="/developer/home" replace />} />
        <Route path="/developer/home" element={<DeveloperHome />} />
        <Route path="/developer/projects/new/extension" element={<ProjectEditor type="extension" />} />
        <Route path="/developer/projects/new/theme" element={<ProjectEditor type="theme" />} />
        <Route path="/developer/projects/:id/edit" element={<ProjectEditor />} />

        {/* Legacy publishing URLs */}
        <Route path="/extensions/create" element={<Navigate to="/developer/projects/new/extension" replace />} />
        <Route path="/themes/create" element={<Navigate to="/developer/projects/new/theme" replace />} />
        <Route path="/extensions/:id/edit" element={<RedirectToEditor />} />

        <Route path="/u/:username" element={<DeveloperProfile />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/docs/launcher" element={<DocsLauncher />} />
        <Route path="/docs/extension" element={<DocsExtension />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/modpack" element={<ModpackEditor />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/imprint" element={<Imprint />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/opt-out" element={<AnalyticsOptOut />} />
        <Route path="/authorize-device" element={<AuthorizeDevice />} />
        <Route path="/link" element={<LinkDevice />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
