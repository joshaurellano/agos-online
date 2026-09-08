import { createContext, useContext, useState } from 'react';
import { LANGUAGES, t as translate } from '../lib/i18n';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem('agos-lang') || 'en'
  );

  const changeLang = (code) => {
    setLang(code);
    localStorage.setItem('agos-lang', code);
  };

  const t = (path) => translate(lang, path);

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, languages: LANGUAGES, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
