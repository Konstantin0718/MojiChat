import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, X } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../../lib/utils';

const EMOJI_CATEGORIES = {
  smileys: {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫', '🤔']
  },
  gestures: {
    name: 'Gestures',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲']
  },
  hearts: {
    name: 'Hearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '🫀', '💋', '🩷', '🩵', '🩶']
  },
  nature: {
    name: 'Nature',
    emojis: ['🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🌍', '🌎', '🌏', '🌙', '⭐', '🌟', '✨', '☀️']
  },
  food: {
    name: 'Food',
    emojis: ['🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍰', '🎂', '🍩', '🍪', '☕', '🍵', '🧋']
  },
  activities: {
    name: 'Activities',
    emojis: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🎿', '🛷', '🥌', '🎯', '🪁', '🎮', '🎲', '🧩', '🎭', '🎨']
  },
  objects: {
    name: 'Objects',
    emojis: ['📱', '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📞', '☎️', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⌚', '💡', '🔦', '🕯️', '💎', '💰', '🎁']
  },
  symbols: {
    name: 'Symbols',
    emojis: ['💯', '🔥', '✨', '🎉', '🎊', '🎈', '💫', '⚡', '💥', '💢', '💦', '💨', '🕳️', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '🔔', '🎵', '🎶', '🏳️', '🏴', '🚩', '✅', '❌', '❓', '❗', '💤', '🆕']
  }
};

const ANIMATED_STICKERS = [
  { id: 'party', emoji: '🎉', animation: 'bounce' },
  { id: 'heart', emoji: '💖', animation: 'pulse' },
  { id: 'fire', emoji: '🔥', animation: 'shake' },
  { id: 'star', emoji: '⭐', animation: 'spin' },
  { id: 'rocket', emoji: '🚀', animation: 'fly' },
  { id: 'rainbow', emoji: '🌈', animation: 'wave' },
  { id: 'sparkles', emoji: '✨', animation: 'twinkle' },
  { id: 'confetti', emoji: '🎊', animation: 'fall' },
  { id: 'love', emoji: '😍', animation: 'heartbeat' },
  { id: 'cool', emoji: '😎', animation: 'slide' },
  { id: 'laugh', emoji: '😂', animation: 'shake' },
  { id: 'clap', emoji: '👏', animation: 'clap' },
  { id: 'thumbsup', emoji: '👍', animation: 'pop' },
  { id: 'muscle', emoji: '💪', animation: 'flex' },
  { id: 'crown', emoji: '👑', animation: 'glow' },
  { id: 'diamond', emoji: '💎', animation: 'sparkle' },
];

export const EmojiPicker = ({ onSelect, onClose }) => {
  const [activeTab, setActiveTab] = useState('emojis');
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('recent_emojis') || '[]');
    } catch {
      return [];
    }
  });

  const handleEmojiSelect = (emoji, isAnimated = false) => {
    // Add to recent
    const newRecent = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 20);
    setRecentEmojis(newRecent);
    localStorage.setItem('recent_emojis', JSON.stringify(newRecent));
    
    onSelect?.(emoji, isAnimated);
  };

  const getAnimationClass = (animation) => {
    const animations = {
      bounce: 'animate-bounce',
      pulse: 'animate-pulse',
      shake: 'animate-[shake_0.5s_ease-in-out_infinite]',
      spin: 'animate-spin',
      fly: 'animate-[fly_1s_ease-in-out_infinite]',
      wave: 'animate-[wave_1s_ease-in-out_infinite]',
      twinkle: 'animate-[twinkle_1s_ease-in-out_infinite]',
    };
    return animations[animation] || '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="absolute bottom-full mb-2 right-0 w-80 bg-card border border-border rounded-2xl shadow-lg overflow-hidden"
      data-testid="emoji-picker"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-medium text-sm">Pick an emoji</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start px-2 pt-2 bg-transparent">
          <TabsTrigger value="emojis" className="text-xs">Emojis</TabsTrigger>
          <TabsTrigger value="stickers" className="text-xs">Stickers</TabsTrigger>
          <TabsTrigger value="gifs" className="text-xs">GIFs</TabsTrigger>
        </TabsList>

        {/* Emojis Tab */}
        <TabsContent value="emojis" className="m-0">
          <ScrollArea className="h-64">
            <div className="p-3 space-y-4">
              {/* Recent */}
              {recentEmojis.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Recent</p>
                  <div className="grid grid-cols-8 gap-1">
                    {recentEmojis.map((emoji, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleEmojiSelect(emoji)}
                        className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted rounded-lg transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Categories */}
              {Object.entries(EMOJI_CATEGORIES).map(([key, category]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground mb-2">{category.name}</p>
                  <div className="grid grid-cols-8 gap-1">
                    {category.emojis.map((emoji, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleEmojiSelect(emoji)}
                        className="w-8 h-8 flex items-center justify-center text-xl hover:bg-muted rounded-lg transition-colors"
                        data-testid={`emoji-${key}-${idx}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Stickers Tab */}
        <TabsContent value="stickers" className="m-0">
          <ScrollArea className="h-64">
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Animated Stickers</p>
              <div className="grid grid-cols-4 gap-2">
                {ANIMATED_STICKERS.map((sticker) => (
                  <motion.button
                    key={sticker.id}
                    onClick={() => handleEmojiSelect(sticker.emoji, true)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={cn(
                      "w-14 h-14 flex items-center justify-center text-3xl",
                      "bg-muted rounded-xl hover:bg-primary/10 transition-colors"
                    )}
                    data-testid={`sticker-${sticker.id}`}
                  >
                    <span className={getAnimationClass(sticker.animation)}>
                      {sticker.emoji}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* GIFs Tab */}
        <TabsContent value="gifs" className="m-0">
          <ScrollArea className="h-64">
            <div className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Popular GIFs</p>
              <div className="grid grid-cols-2 gap-2">
                {/* GIF-like animated emoji combinations */}
                {[
                  { emojis: ['🎉', '🎊', '✨', '🎈'], label: 'Party' },
                  { emojis: ['❤️', '💕', '💖', '💗'], label: 'Love' },
                  { emojis: ['😂', '🤣', '😆', '😄'], label: 'Laugh' },
                  { emojis: ['👋', '🙋', '🤗', '😊'], label: 'Hello' },
                  { emojis: ['👏', '🎊', '🥳', '🎉'], label: 'Congrats' },
                  { emojis: ['😢', '😭', '💔', '🥺'], label: 'Sad' },
                  { emojis: ['🔥', '💥', '⚡', '💫'], label: 'Fire' },
                  { emojis: ['🌟', '✨', '⭐', '💫'], label: 'Stars' },
                ].map((gif, idx) => (
                  <motion.button
                    key={idx}
                    onClick={() => handleEmojiSelect(gif.emojis.join(''), true)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="p-3 bg-muted rounded-xl hover:bg-primary/10 transition-colors text-left"
                  >
                    <div className="flex gap-1 text-2xl mb-1">
                      {gif.emojis.map((e, i) => (
                        <motion.span
                          key={i}
                          animate={{ y: [0, -5, 0] }}
                          transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                        >
                          {e}
                        </motion.span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{gif.label}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};
