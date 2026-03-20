import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { useAuth } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AuthCallback from "./pages/AuthCallback";
import ChatLayout from "./components/chat/ChatLayout";

// Invite join page — handles /join/:inviteCode
const JoinPage = () => {
  const { inviteCode } = useParams();
  const { isAuthenticated, api } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('joining');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=/join/${inviteCode}`);
      return;
    }
    api.post(`/users/join/${inviteCode}`)
      .then((res) => {
        navigate(`/chat/${res.data.conversation_id}`);
      })
      .catch(() => {
        setStatus('error');
      });
  }, [isAuthenticated, inviteCode, api, navigate]);

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen text-center">
        <div>
          <p className="text-2xl mb-2">❌</p>
          <p className="font-semibold">Invalid or expired invite link.</p>
          <button className="mt-4 text-primary underline" onClick={() => navigate('/')}>Go home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground animate-pulse">Joining chat…</p>
    </div>
  );
};

// Router wrapper to handle OAuth callback
const AppRouter = () => {
  const location = useLocation();
  
  // Check URL fragment for session_id (OAuth callback)
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route 
        path="/chat" 
        element={
          <ProtectedRoute>
            <ChatLayout />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/chat/:conversationId" 
        element={
          <ProtectedRoute>
            <ChatLayout />
          </ProtectedRoute>
        } 
      />
      <Route path="/join/:inviteCode" element={<JoinPage />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="mojichat-theme">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
