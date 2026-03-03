import { motion } from 'framer-motion';

export const TypingIndicator = ({ userName }) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1 bg-muted rounded-full px-4 py-2">
        <motion.div
          className="w-2 h-2 rounded-full bg-primary animate-bounce-dot"
          style={{ animationDelay: '-0.32s' }}
        />
        <motion.div
          className="w-2 h-2 rounded-full bg-secondary animate-bounce-dot"
          style={{ animationDelay: '-0.16s' }}
        />
        <motion.div
          className="w-2 h-2 rounded-full bg-accent animate-bounce-dot"
        />
      </div>
      {userName && (
        <span className="text-sm text-muted-foreground">
          {userName} is typing...
        </span>
      )}
    </div>
  );
};
