import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCheck, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';

export const EmojiRevealCard = ({ 
  message, 
  isOwn = false, 
  showReadStatus = true,
  currentUserId 
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  
  const isRead = message.read_by?.length > 1 || 
    (message.read_by?.some(id => id !== message.sender_id));
  
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      <div
        onClick={() => setIsRevealed(!isRevealed)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsRevealed(!isRevealed)}
        role="button"
        tabIndex={0}
        aria-label={isRevealed ? "Hide original text" : "Reveal original text"}
        data-testid={`message-bubble-${message.message_id}`}
        className={cn(
          "max-w-[80%] p-4 rounded-2xl relative cursor-pointer overflow-hidden group",
          "transition-colors duration-300",
          isOwn 
            ? "bg-primary text-primary-foreground rounded-br-sm" 
            : "bg-muted text-foreground rounded-bl-sm",
          "hover:shadow-lg"
        )}
      >
        {/* Sender name for group chats */}
        {!isOwn && message.sender_name && (
          <p className="text-xs font-medium text-primary mb-1">
            {message.sender_name}
          </p>
        )}

        {/* Content container */}
        <div className="relative min-h-[1.5rem]">
          <AnimatePresence mode="wait">
            {isRevealed ? (
              <motion.div
                key="text"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-2"
              >
                <Eye className="w-4 h-4 mt-0.5 opacity-50 flex-shrink-0" />
                <p className="text-sm leading-relaxed break-words">
                  {message.content}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="emoji"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="text-2xl leading-relaxed tracking-wider"
              >
                {message.emoji_content || '🔮'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Time and read status */}
        <div className={cn(
          "flex items-center gap-1 mt-2 text-xs",
          isOwn ? "justify-end opacity-70" : "justify-start text-muted-foreground"
        )}>
          <span>{formatTime(message.created_at)}</span>
          {isOwn && showReadStatus && (
            isRead ? (
              <CheckCheck className="w-4 h-4 text-accent" />
            ) : (
              <Check className="w-4 h-4" />
            )
          )}
        </div>

        {/* Tap hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isRevealed ? 0 : 1 }}
          className={cn(
            "absolute bottom-1 right-2 text-[10px] opacity-50",
            "hidden group-hover:block"
          )}
        >
          tap to reveal
        </motion.div>
      </div>
    </motion.div>
  );
};
