import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { motion } from 'framer-motion';

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-14 h-8 rounded-full bg-muted p-1 focus-ring"
      aria-label="Toggle theme"
      data-testid="theme-toggle"
    >
      <motion.div
        className="absolute w-6 h-6 rounded-full flex items-center justify-center"
        animate={{
          x: theme === 'dark' ? 24 : 0,
          backgroundColor: theme === 'dark' ? '#8B5CF6' : '#F59E0B',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {theme === 'dark' ? (
          <Moon className="w-4 h-4 text-white" />
        ) : (
          <Sun className="w-4 h-4 text-white" />
        )}
      </motion.div>
    </button>
  );
};
