import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Check } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';

const LANGUAGES = {
  en: { name: 'English', flag: '🇬🇧', native: 'English' },
  bg: { name: 'Bulgarian', flag: '🇧🇬', native: 'Български' },
  de: { name: 'German', flag: '🇩🇪', native: 'Deutsch' },
  es: { name: 'Spanish', flag: '🇪🇸', native: 'Español' },
  fr: { name: 'French', flag: '🇫🇷', native: 'Français' },
  it: { name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
  ru: { name: 'Russian', flag: '🇷🇺', native: 'Русский' },
  tr: { name: 'Turkish', flag: '🇹🇷', native: 'Türkçe' },
  zh: { name: 'Chinese', flag: '🇨🇳', native: '中文' },
  ja: { name: 'Japanese', flag: '🇯🇵', native: '日本語' },
  ko: { name: 'Korean', flag: '🇰🇷', native: '한국어' },
  ar: { name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
  pt: { name: 'Portuguese', flag: '🇵🇹', native: 'Português' },
  nl: { name: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
  pl: { name: 'Polish', flag: '🇵🇱', native: 'Polski' },
  uk: { name: 'Ukrainian', flag: '🇺🇦', native: 'Українська' },
};

export const LanguageSelector = ({ 
  currentLanguage = 'en', 
  onLanguageChange,
  variant = 'button' // 'button' | 'inline'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState(currentLanguage);

  useEffect(() => {
    setSelectedLang(currentLanguage);
  }, [currentLanguage]);

  const handleSelect = (langCode) => {
    setSelectedLang(langCode);
    onLanguageChange?.(langCode);
    setIsOpen(false);
  };

  const currentLangData = LANGUAGES[selectedLang] || LANGUAGES.en;

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap gap-2" data-testid="language-selector-inline">
        {Object.entries(LANGUAGES).map(([code, data]) => (
          <Button
            key={code}
            variant={selectedLang === code ? "default" : "outline"}
            size="sm"
            className="gap-2 rounded-full"
            onClick={() => handleSelect(code)}
            data-testid={`lang-btn-${code}`}
          >
            <span>{data.flag}</span>
            <span className="hidden sm:inline">{data.native}</span>
          </Button>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 rounded-full"
          data-testid="language-selector-btn"
        >
          <span className="text-lg">{currentLangData.flag}</span>
          <span className="hidden sm:inline">{currentLangData.native}</span>
          <Globe className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Select Language
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-80">
          <div className="grid grid-cols-2 gap-2 p-1">
            {Object.entries(LANGUAGES).map(([code, data]) => (
              <motion.button
                key={code}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelect(code)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl text-left transition-colors",
                  selectedLang === code 
                    ? "bg-primary/10 border-2 border-primary" 
                    : "bg-muted hover:bg-muted/80 border-2 border-transparent"
                )}
                data-testid={`lang-option-${code}`}
              >
                <span className="text-2xl">{data.flag}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{data.native}</p>
                  <p className="text-xs text-muted-foreground truncate">{data.name}</p>
                </div>
                {selectedLang === code && (
                  <Check className="w-5 h-5 text-primary flex-shrink-0" />
                )}
              </motion.button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export { LANGUAGES };
