import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-16 h-9 rounded-full bg-muted p-1 border-2 border-foreground/50 focus-ring"
      aria-label="Toggle theme"
      title="Toggle theme"
      data-testid="theme-toggle"
    >
      <motion.div
        className="absolute w-7 h-7 rounded-full flex items-center justify-center"
        animate={{
          x: theme === 'dark' ? 28 : 0,
          backgroundColor: theme === 'dark' ? '#8B5CF6' : '#F59E0B',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {theme === 'dark' ? (
          <Moon className="w-5 h-5 text-white" />
        ) : (
          <Sun className="w-5 h-5 text-white" />
        )}
      </motion.div>
    </button>
  );
};
