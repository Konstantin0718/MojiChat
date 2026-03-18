import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Globe, Loader2, Languages } from 'lucide-react';
import { cn } from '../../lib/utils';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Language detection heuristics
const detectLanguage = (text) => {
  if (!text) return null;
  if (/[\u0400-\u04FF]/.test(text)) return /[\u0404\u0406\u0407\u0490\u0491]/.test(text) ? 'uk' : /[\u0451\u0449\u044A\u044B\u044D]/.test(text) ? 'ru' : 'bg';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[äöüßÄÖÜ]/.test(text)) return 'de';
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) return 'fr';
  if (/[ñáéíóú¿¡]/i.test(text)) return 'es';
  if (/[ğışçöüĞİŞÇÖÜ]/.test(text)) return 'tr';
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(text)) return 'pl';
  if (/[ãõâêôáéíóúç]/i.test(text)) return 'pt';
  return 'en';
};

const LANG_FLAGS = {
  bg: '🇧🇬', en: '🇬🇧', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷', it: '🇮🇹',
  ru: '🇷🇺', tr: '🇹🇷', zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', ar: '🇸🇦',
  pt: '🇵🇹', nl: '🇳🇱', pl: '🇵🇱', uk: '🇺🇦',
};

export const EmojiRevealCard = ({ 
  message, 
  isOwn = false, 
  showReadStatus = true,
  currentUserId,
  userLanguage = 'bg',
  onReaction
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [translatedText, setTranslatedText] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const hasEmoji = !!message.emoji_content;
  const hasTranslation = !!translatedText && translatedText !== message.content;
  const detectedLang = detectLanguage(message.content);
  const langFlag = LANG_FLAGS[detectedLang] || '🌐';

  const isRead = message.read_by?.length > 1 || 
    (message.read_by?.some(id => id !== message.sender_id));

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const doTranslate = useCallback(async () => {
    if (translatedText) return; // Already translated
    setIsTranslating(true);
    try {
      const token = localStorage.getItem('auth_token');
      const targetLang = userLanguage === 'auto' ? undefined : userLanguage;
      const res = await axios.post(`${API_URL}/api/translate`, 
        { text: message.content, target_language: targetLang || 'bg' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.translated) {
        setTranslatedText(res.data.translated);
      }
    } catch (err) {
      console.error('Translation failed:', err);
    }
    setIsTranslating(false);
  }, [translatedText, userLanguage, message.content]);

  const handleClick = useCallback(async (e) => {
    e.stopPropagation();
    
    if (hasEmoji) {
      // Emoji message: toggle between emoji and revealed (translated + original)
      if (!isRevealed) {
        setIsRevealed(true);
        await doTranslate();
      } else {
        setIsRevealed(false);
      }
    } else {
      // Plain text message: toggle translation overlay
      if (!isRevealed) {
        setIsRevealed(true);
        await doTranslate();
      } else {
        setIsRevealed(false);
      }
    }
  }, [hasEmoji, isRevealed, doTranslate]);

  const emojiChars = hasEmoji ? [...message.emoji_content] : [];

  return (
    <div className={cn("flex mb-2", isOwn ? "justify-end" : "justify-start")}>
      <div
        onClick={handleClick}
        data-testid={`message-bubble-${message.message_id}`}
        className={cn(
          "max-w-[80%] px-4 py-3 rounded-2xl cursor-pointer select-none",
          "transition-all duration-200 hover:shadow-lg active:scale-[0.98]",
          isOwn 
            ? "bg-primary text-primary-foreground rounded-br-sm" 
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {/* Sender name */}
        {!isOwn && message.sender_name && (
          <p className="text-xs font-semibold text-primary mb-1.5">
            {message.sender_name}
          </p>
        )}

        {/* REVEALED STATE (for both emoji and plain text messages) */}
        {isRevealed ? (
          <div className="space-y-2">
            {isTranslating ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm opacity-70">Translating...</span>
              </div>
            ) : (
              <>
                {/* Translated text */}
                <div className="flex items-start gap-2">
                  <Languages className="w-4 h-4 mt-0.5 opacity-60 flex-shrink-0" />
                  <p className="text-sm leading-relaxed break-words">
                    {translatedText || message.content}
                  </p>
                </div>
                
                {/* Original text */}
                {hasTranslation && (
                  <div className={cn(
                    "mt-2 pt-2 space-y-1",
                    isOwn ? "border-t border-white/20" : "border-t border-foreground/10"
                  )}>
                    <div className="flex items-center gap-1 text-[11px] opacity-50">
                      <Globe className="w-3 h-3" />
                      <span>Original ({langFlag}):</span>
                    </div>
                    <p className="text-xs opacity-60 italic">{message.content}</p>
                  </div>
                )}
              </>
            )}

            <p className={cn(
              "text-[10px] text-right mt-1",
              isOwn ? "text-white/40" : "text-foreground/30"
            )}>
              {hasEmoji ? 'tap for emoji' : 'tap to close'}
            </p>
          </div>
        ) : hasEmoji ? (
          /* EMOJI MODE */
          <div>
            <div className="text-2xl leading-relaxed tracking-wider flex flex-wrap gap-0.5">
              {emojiChars.map((char, idx) => (
                <motion.span
                  key={idx}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  {char}
                </motion.span>
              ))}
            </div>
            <p className={cn(
              "text-[10px] text-right mt-1",
              isOwn ? "text-white/40" : "text-foreground/30"
            )}>
              tap to reveal
            </p>
          </div>
        ) : (
          /* PLAIN TEXT MODE - clickable for translation */
          <div>
            <p className="text-sm leading-relaxed break-words">{message.content}</p>
            <p className={cn(
              "text-[10px] text-right mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
              isOwn ? "text-white/30" : "text-foreground/20"
            )}>
              tap to translate
            </p>
          </div>
        )}

        {/* Reactions */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-current/10">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <span key={emoji} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm bg-background/50">
                {emoji}<span className="text-xs">{users.length}</span>
              </span>
            ))}
          </div>
        )}

        {/* Time + language badge + read status */}
        <div className={cn(
          "flex items-center gap-1.5 mt-1.5 text-[11px]",
          isOwn ? "justify-end opacity-60" : "justify-start text-muted-foreground"
        )}>
          <span className="opacity-70">{langFlag}</span>
          <span>{formatTime(message.created_at)}</span>
          {isOwn && showReadStatus && (
            isRead ? (
              <CheckCheck className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )
          )}
        </div>
      </div>
    </div>
  );
};
