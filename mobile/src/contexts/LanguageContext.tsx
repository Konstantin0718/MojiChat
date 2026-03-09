import React, { createContext, useContext, useState, useEffect } from 'react';
import { setLanguage, getCurrentLanguage, initializeLanguage, t as translate, availableLanguages } from '../i18n';

interface LanguageContextType {
  language: string;
  setAppLanguage: (lang: string) => Promise<void>;
  t: (key: string, options?: object) => string;
  availableLanguages: typeof availableLanguages;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState(getCurrentLanguage());
  const [, forceUpdate] = useState({});

  useEffect(() => {
    initializeLanguage().then(() => {
      setLanguageState(getCurrentLanguage());
      forceUpdate({});
    });
  }, []);

  const setAppLanguage = async (lang: string) => {
    await setLanguage(lang);
    setLanguageState(lang);
    forceUpdate({}); // Force re-render to update all translations
  };

  const t = (key: string, options?: object) => {
    return translate(key, options);
  };

  return (
    <LanguageContext.Provider value={{ language, setAppLanguage, t, availableLanguages }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
