import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ScrollManager from './components/ScrollManager'
import AdminPanel from './pages/AdminPanel'
import AnalyticsOptOut from './pages/AnalyticsOptOut'
import Changelog from './pages/Changelog'
import Dashboard from './pages/Dashboard'
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

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/extensions" element={<Extensions />} />
        <Route path="/extensions/create" element={<ProjectEditor type="extension" />} />
        <Route path="/themes/create" element={<ProjectEditor type="theme" />} />
        <Route path="/extensions/:id/edit" element={<ProjectEditor />} />
        <Route path="/extensions/:id" element={<ExtensionDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
