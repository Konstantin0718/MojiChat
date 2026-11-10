import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, KeyRound, ArrowRight, Loader2, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Toaster, toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const requestReset = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
      toast.success(res.data?.message || 'If this email exists, a reset link has been sent');
      // In development the backend may return the token directly.
      if (res.data?.reset_token) {
        setToken(res.data.reset_token);
        toast.info('Dev mode: reset token pre-filled');
      }
      setStep('reset');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (!token || !newPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        token: token.trim(),
        new_password: newPassword,
      });
      toast.success('Password reset successfully. Please sign in.');
      navigate('/login');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Invalid or expired reset token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex" data-testid="forgot-password-page">
      <Toaster position="top-center" richColors />

      <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
        <div className="max-w-md w-full mx-auto">
          <div className="absolute top-4 right-4">
            <ThemeToggle />
          </div>

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Link to="/login" className="flex items-center gap-2 mb-8 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </Link>

            <h1 className="text-4xl font-heading font-bold mb-2">
              {step === 'request' ? 'Forgot password?' : 'Reset password'}
            </h1>
            <p className="text-muted-foreground">
              {step === 'request'
                ? "Enter your email and we'll send you a reset link."
                : 'Enter the reset token and choose a new password.'}
            </p>
          </motion.div>

          {step === 'request' ? (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={requestReset}
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
                    data-testid="forgot-email-input"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-6 rounded-xl text-base shadow-neon"
                disabled={loading}
                data-testid="forgot-submit-btn"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>Send reset link<ArrowRight className="w-5 h-5 ml-2" /></>
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Already have a token?{' '}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setStep('reset')}
                >
                  Enter it here
                </button>
              </p>
            </motion.form>
          ) : (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={resetPassword}
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="token" className="text-sm font-medium">Reset token</Label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="token"
                    type="text"
                    placeholder="Paste your reset token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pl-12 py-6 rounded-xl"
                    data-testid="reset-token-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-sm font-medium">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-12 py-6 rounded-xl"
                    data-testid="new-password-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-12 py-6 rounded-xl"
                    data-testid="confirm-password-input"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-6 rounded-xl text-base shadow-neon"
                disabled={loading}
                data-testid="reset-submit-btn"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reset password'}
              </Button>
            </motion.form>
          )}
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center bg-muted/30 relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center"
        >
          <div className="text-9xl mb-8 animate-emoji-pulse">🔑</div>
          <h2 className="text-3xl font-heading font-bold mb-4">
            Recover Your<br />Account
          </h2>
          <p className="text-muted-foreground max-w-sm">
            Reset your password and get back to chatting in emojis.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
