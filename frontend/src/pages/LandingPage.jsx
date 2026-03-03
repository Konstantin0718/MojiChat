import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  MessageCircle, 
  Lock, 
  Smile, 
  Users, 
  Zap,
  ArrowRight,
  Check
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { useAuth } from '../contexts/AuthContext';

const features = [
  {
    icon: Lock,
    title: 'Hidden in Plain Sight',
    description: 'Your messages appear as fun emojis. Only the recipient can reveal the real text.',
    color: 'text-primary'
  },
  {
    icon: Smile,
    title: 'AI-Powered Emoji',
    description: 'Smart AI converts your words into meaningful, contextual emojis.',
    color: 'text-secondary'
  },
  {
    icon: Users,
    title: 'Group Chats',
    description: 'Create groups with friends. Share emoji-encoded messages together.',
    color: 'text-accent'
  }
];

const steps = [
  { number: '01', title: 'Write your message', description: 'Type like normal' },
  { number: '02', title: 'AI transforms it', description: 'Into expressive emojis' },
  { number: '03', title: 'Recipient sees emojis', description: 'Tap to reveal text' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate('/chat');
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <span className="text-3xl">💬</span>
            <span className="text-2xl font-heading font-bold gradient-brand bg-clip-text text-transparent">
              MojiChat
            </span>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            <ThemeToggle />
            {isAuthenticated ? (
              <Button onClick={() => navigate('/chat')} className="rounded-full" data-testid="go-to-chat-btn">
                Open Chat
              </Button>
            ) : (
              <Button onClick={() => navigate('/login')} variant="outline" className="rounded-full" data-testid="login-nav-btn">
                Login
              </Button>
            )}
          </motion.div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 text-8xl opacity-10 animate-emoji-pulse">😊</div>
          <div className="absolute top-40 right-20 text-7xl opacity-10 animate-emoji-pulse" style={{ animationDelay: '0.5s' }}>🎉</div>
          <div className="absolute bottom-20 left-1/4 text-6xl opacity-10 animate-emoji-pulse" style={{ animationDelay: '1s' }}>💬</div>
          <div className="absolute top-1/2 right-1/4 text-9xl opacity-10 animate-emoji-pulse" style={{ animationDelay: '1.5s' }}>🔒</div>
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Text */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Zap className="w-4 h-4" />
                AI-Powered Messaging
              </div>
              
              <h1 className="text-5xl md:text-7xl font-heading font-black leading-none tracking-tight">
                Chat in
                <span className="gradient-brand bg-clip-text text-transparent"> Emojis</span>
                <br />
                Reveal the
                <span className="text-secondary"> Truth</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
                A messaging app where your words transform into expressive emojis. 
                Only the recipient can tap to reveal what you really said. 
                <span className="text-primary font-medium"> Privacy meets fun!</span>
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={handleGetStarted}
                  size="lg"
                  className="rounded-full px-8 shadow-neon text-lg group"
                  data-testid="get-started-btn"
                >
                  Get Started
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  variant="outline"
                  size="lg"
                  className="rounded-full px-8"
                  onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Learn More
                </Button>
              </div>
            </motion.div>

            {/* Right side - Demo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative"
            >
              <div className="relative bg-card rounded-3xl shadow-soft p-6 border border-border">
                {/* Mock chat interface */}
                <div className="space-y-4">
                  {/* Received message - emoji */}
                  <div className="flex justify-start">
                    <motion.div 
                      className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 max-w-[70%]"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-2xl tracking-wider">👋🌞☕🎉</p>
                      <p className="text-xs text-muted-foreground mt-1">tap to reveal</p>
                    </motion.div>
                  </div>
                  
                  {/* Sent message - revealed */}
                  <div className="flex justify-end">
                    <motion.div 
                      className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-3 max-w-[70%]"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-sm">Good morning! ☀️</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xs opacity-70">09:41</span>
                        <Check className="w-3 h-3" />
                        <Check className="w-3 h-3 -ml-2" />
                      </div>
                    </motion.div>
                  </div>
                  
                  {/* Received - emoji only */}
                  <div className="flex justify-start">
                    <motion.div 
                      className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-2xl">🍕🎬🏠❓</p>
                    </motion.div>
                  </div>
                </div>
                
                {/* Floating emoji decorations */}
                <motion.div 
                  className="absolute -top-4 -right-4 text-4xl"
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  🔮
                </motion.div>
                <motion.div 
                  className="absolute -bottom-4 -left-4 text-4xl"
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                >
                  ✨
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4">
              Why <span className="text-primary">MojiChat</span>?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Experience a new way of communicating that's fun, private, and expressive
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className="bg-card rounded-3xl p-8 border border-border shadow-soft"
              >
                <div className={`w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-6 ${feature.color}`}>
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-heading font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4">
              How it <span className="text-secondary">Works</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.15 }}
                className="relative"
              >
                <span className="text-8xl font-heading font-black text-muted/30">{step.number}</span>
                <div className="-mt-12 ml-4">
                  <h3 className="text-xl font-heading font-bold mb-2">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 right-0 translate-x-1/2">
                    <ArrowRight className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="gradient-brand rounded-3xl p-12 md:p-16"
          >
            <h2 className="text-4xl md:text-5xl font-heading font-black text-white mb-6">
              Ready to Chat in Emojis?
            </h2>
            <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
              Join MojiChat today and transform the way you communicate. 
              Your friends will love trying to decode your messages!
            </p>
            <Button 
              onClick={handleGetStarted}
              size="lg"
              variant="secondary"
              className="rounded-full px-10 text-lg"
              data-testid="cta-get-started-btn"
            >
              Start Chatting Now
              <MessageCircle className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💬</span>
            <span className="font-heading font-bold">MojiChat</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 MojiChat. Hide in plain sight.
          </p>
        </div>
      </footer>
    </div>
  );
}
