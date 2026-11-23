import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

export const GOOGLE_CLIENT_ID = (process.env.REACT_APP_GOOGLE_CLIENT_ID || '').trim();
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export default function GoogleSignIn({ text = 'continue_with', testId = 'google-login-btn' }) {
  const buttonRef = useRef(null);
  const { loginWithGoogleCredential } = useAuth();
  const credentialLogin = useRef(loginWithGoogleCredential);
  credentialLogin.current = loginWithGoogleCredential;
  const navigate = useNavigate();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;
    const el = buttonRef.current;

    const handleCredential = async (response) => {
      const credential = response?.credential;
      if (!credential) {
        toast.error('Google sign-in failed');
        return;
      }
      try {
        await credentialLogin.current(credential);
        toast.success('Welcome!');
        navigate('/chat');
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Google sign-in failed');
      }
    };

    const render = () => {
      if (cancelled || !el || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
        auto_select: false,
      });
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text,
        shape: 'pill',
        width: 360,
        logo_alignment: 'left',
      });
    };

    if (window.google?.accounts?.id) {
      render();
      return () => {
        cancelled = true;
      };
    }

    let script = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const onLoad = () => render();
    const onError = () => {
      if (!cancelled) setUnavailable(true);
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    return () => {
      cancelled = true;
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, [navigate, text]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="mb-6" data-testid={testId}>
      <div ref={buttonRef} className="flex justify-center min-h-[40px]" />
      {unavailable && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Google sign-in is unavailable
        </p>
      )}
    </div>
  );
}
