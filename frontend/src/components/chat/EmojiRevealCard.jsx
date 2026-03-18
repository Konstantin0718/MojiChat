import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCheck, Eye, Globe, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍', '👎', '🎉'];

export const EmojiRevealCard = ({ 
  message, 
  isOwn = false, 
  showReadStatus = true,
  currentUserId,
  userLanguage = 'en',
  onReaction
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [translatedText, setTranslatedText] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  
  const isRead = message.read_by?.length > 1 || 
    (message.read_by?.some(id => id !== message.sender_id));

  const hasTranslation = !!translatedText && translatedText !== message.content;

  const handleReveal = async () => {
    if (!isRevealed && !translatedText) {
      // Translate on first reveal
      setIsTranslating(true);
      try {
        const token = localStorage.getItem('auth_token');
        const res = await axios.post(`${API_URL}/api/translate`, 
          { text: message.content, target_language: userLanguage },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTranslatedText(res.data.translated);
      } catch (_) {
        setTranslatedText(null);
      }
      setIsTranslating(false);
    }
    setIsRevealed(!isRevealed);
  };
  
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };

  // Check if emoji content is animated (contains multiple emojis in sequence)
  const emojiChars = message.emoji_content ? [...message.emoji_content] : [];
  const isAnimatedEmoji = emojiChars.length > 4;

  const handleReaction = (emoji) => {
    onReaction?.(emoji);
    setShowReactions(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex group",
        isOwn ? "justify-end" : "justify-start"
      )}
    >
      <div className="relative">
        {/* Reaction picker */}
        {!isOwn && (
          <Popover open={showReactions} onOpenChange={setShowReactions}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "absolute -right-2 top-0 opacity-0 group-hover:opacity-100 transition-opacity",
                  "w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center",
                  "hover:bg-muted text-xs z-10"
                )}
              >
                😀
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="top">
              <div className="flex gap-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="text-xl hover:scale-125 transition-transform p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        <div
          onClick={() => handleReveal()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleReveal()}
          role="button"
          tabIndex={0}
          aria-label={isRevealed ? "Hide original text" : "Reveal original text"}
          data-testid={`message-bubble-${message.message_id}`}
          className={cn(
            "max-w-[80%] p-4 rounded-2xl relative cursor-pointer overflow-hidden",
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
                  className="space-y-2"
                >
                  {isTranslating ? (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                      <span className="text-sm opacity-50">Translating...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Eye className="w-4 h-4 mt-0.5 opacity-50 flex-shrink-0" />
                        <p className="text-sm leading-relaxed break-words">
                          {translatedText || message.content}
                        </p>
                      </div>
                      
                      {/* Translation indicator + original */}
                      {hasTranslation && (
                        <>
                          <div className="flex items-center gap-1 text-xs opacity-60">
                            <Globe className="w-3 h-3" />
                            <span>Translated</span>
                          </div>
                          <div className="text-xs opacity-50 italic border-t border-current/20 pt-2 mt-2">
                            {message.content}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="emoji"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="relative"
                >
                  {/* Animated emoji display */}
                  {isAnimatedEmoji ? (
                    <div className="flex flex-wrap gap-1 text-2xl leading-relaxed tracking-wider">
                      {emojiChars.map((char, idx) => (
                        <motion.span
                          key={idx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ 
                            opacity: 1, 
                            y: 0,
                            scale: [1, 1.1, 1],
                          }}
                          transition={{
                            delay: idx * 0.05,
                            scale: {
                              repeat: Infinity,
                              repeatDelay: 2,
                              duration: 0.3,
                            }
                          }}
                        >
                          {char}
                        </motion.span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xl leading-relaxed tracking-wider">
                      {message.emoji_content || '🔮'}
                    </p>
                  )}
                  
                  {/* Sparkle effect for animated */}
                  {isAnimatedEmoji && (
                    <motion.div
                      className="absolute -top-1 -right-1"
                      animate={{ 
                        rotate: [0, 15, -15, 0],
                        scale: [1, 1.2, 1]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="w-4 h-4 text-yellow-500" />
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Reactions display */}
          {message.reactions && Object.keys(message.reactions).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-current/10">
              {Object.entries(message.reactions).map(([emoji, users]) => (
                <motion.span
                  key={emoji}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm",
                    "bg-background/50"
                  )}
                >
                  {emoji}
                  <span className="text-xs">{users.length}</span>
                </motion.span>
              ))}
            </div>
          )}

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
              "absolute bottom-1 right-2 text-[10px] opacity-0 group-hover:opacity-50",
              "transition-opacity pointer-events-none"
            )}
          >
            tap to reveal
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
