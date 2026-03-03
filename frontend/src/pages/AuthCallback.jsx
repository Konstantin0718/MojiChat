import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { processGoogleAuth } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use ref to prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      try {
        // Extract session_id from URL fragment
        const hash = location.hash;
        const params = new URLSearchParams(hash.replace('#', ''));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          console.error('No session_id found in URL');
          navigate('/login');
          return;
        }

        // Process the session with backend
        await processGoogleAuth(sessionId);
        
        // Navigate to chat (remove the hash from URL)
        navigate('/chat', { replace: true });
      } catch (error) {
        console.error('Auth callback error:', error);
        navigate('/login');
      }
    };

    processAuth();
  }, [location, navigate, processGoogleAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="auth-callback">
      <div className="text-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
