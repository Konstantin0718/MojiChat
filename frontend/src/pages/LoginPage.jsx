import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuth } from '../contexts/AuthContext';
import GoogleSignIn, { GOOGLE_CLIENT_ID } from '../components/auth/GoogleSignIn';
import { Toaster, toast } from 'sonner';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/chat');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/chat');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex" data-testid="login-page">
      <Toaster position="top-center" richColors />
      
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
        <div className="max-w-md w-full mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link to="/" className="flex items-center gap-2 mb-8">
              <span className="text-3xl">💬</span>
              <span className="text-2xl font-heading font-bold gradient-brand bg-clip-text text-transparent">
                MojiChat
              </span>
            </Link>
            
            <h1 className="text-4xl font-heading font-bold mb-2">Welcome back!</h1>
            <p className="text-muted-foreground">
              Sign in to continue chatting in emojis
            </p>
          </motion.div>

          {GOOGLE_CLIENT_ID && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <GoogleSignIn text="signin_with" testId="google-login-btn" />
              </motion.div>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-background text-muted-foreground">or continue with email</span>
                </div>
              </div>
            </>
          )}

          {/* Login Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-12 py-6 rounded-xl"
                  data-testid="email-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-12 py-6 rounded-xl"
                  data-testid="password-input"
                />
              </div>
              <div className="text-right">
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline font-medium"
                  data-testid="forgot-password-link"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full py-6 rounded-xl text-base shadow-neon"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </motion.form>

          {/* Register link */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mt-6 text-muted-foreground"
          >
            Don't have an account?{' '}
            <Link 
              to="/register" 
              className="text-primary hover:underline font-medium"
              data-testid="register-link"
            >
              Sign up
            </Link>
          </motion.p>
        </div>
      </div>

      {/* Right side - Decoration (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-muted/30 relative overflow-hidden">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center"
        >
          <div className="text-9xl mb-8 animate-emoji-pulse">🔐</div>
          <h2 className="text-3xl font-heading font-bold mb-4">
            Your Messages,<br />Your Emojis
          </h2>
          <p className="text-muted-foreground max-w-sm">
            Every message becomes a colorful emoji sequence. 
            Only the right person can decode it.
          </p>
        </motion.div>

        {/* Floating emojis */}
        <motion.div
          className="absolute top-20 left-10 text-5xl"
          animate={{ y: [0, -20, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          😊
        </motion.div>
        <motion.div
          className="absolute bottom-20 right-10 text-5xl"
          animate={{ y: [0, 20, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1 }}
        >
          🎉
        </motion.div>
        <motion.div
          className="absolute top-1/2 left-20 text-4xl"
          animate={{ x: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          💬
        </motion.div>
      </div>
    </div>
  );
}
