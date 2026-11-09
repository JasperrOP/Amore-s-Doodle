import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from '../features/auth/AuthContext'
import { RoomProvider, useRoom } from '../features/room/RoomContext'
import { DialogProvider } from '../components/DialogContext'
import LoginPage from '../features/auth/LoginPage'
import HomePage from '../features/room/HomePage'
import CanvasPage from '../features/canvas/CanvasPage'
import ChatPage from '../features/chat/ChatPage'
import GalleryPage from '../features/gallery/GalleryPage'
import GuessPage from '../features/guessing/GuessPage'
import SettingsPage from '../features/settings/SettingsPage'
import BottomNav from '../components/BottomNav'
import InstallHint from '../components/InstallHint'

const Splash = () => <div className="h-full grid place-items-center muted">Loading…</div>

function Protected() {
  const { session, loading } = useAuth()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <RoomProvider><Shell /></RoomProvider>
}

function Shell() {
  const { loading } = useRoom()
  if (loading) return <Splash />
  return (
    <>
      <div style={{ paddingBottom: 72 }}>
        <Outlet />
      </div>
      <InstallHint />
      <BottomNav />
    </>
  )
}

function NeedsRoom({ children }) {
  const { room } = useRoom()
  return room ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <DialogProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Protected />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/canvas" element={<NeedsRoom><CanvasPage /></NeedsRoom>} />
              <Route path="/chat" element={<NeedsRoom><ChatPage /></NeedsRoom>} />
              <Route path="/gallery" element={<NeedsRoom><GalleryPage /></NeedsRoom>} />
              <Route path="/guess" element={<NeedsRoom><GuessPage /></NeedsRoom>} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DialogProvider>
    </AuthProvider>
  )
}
