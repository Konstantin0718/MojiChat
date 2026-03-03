import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AuthCallback from "./pages/AuthCallback";
import ChatLayout from "./components/chat/ChatLayout";

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
