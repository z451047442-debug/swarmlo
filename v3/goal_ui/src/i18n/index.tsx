import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { enMain } from "./dictionaries/en/main";
import { zhMain } from "./dictionaries/zh/main";
import { enReport } from "./dictionaries/en/report";
import { zhReport } from "./dictionaries/zh/report";
import { enAgents } from "./dictionaries/en/agents";
import { zhAgents } from "./dictionaries/zh/agents";
import { enMisc } from "./dictionaries/en/misc";
import { zhMisc } from "./dictionaries/zh/misc";

export type Lang = "en" | "zh";

export const LANG_STORAGE_KEY = "swarmlo-lang";

const dictionaries: Record<Lang, Record<string, string>> = {
  en: { ...enMain, ...enReport, ...enAgents, ...enMisc },
  zh: { ...zhMain, ...zhReport, ...zhAgents, ...zhMisc },
};

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

// Default follows the browser language; a manual toggle is persisted and wins.
function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
    return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch (err) {
      console.warn("Failed to persist language preference:", err);
    }
  }, []);

  // t(key, vars?) — looks up the current language, falls back to en, then the key
  // itself (so missing translations are visible during development). {name} in the
  // value is replaced with vars.name.
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within an I18nProvider");
  return value;
}
