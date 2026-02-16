import { en, type TranslationKey } from "./en";
import { ja } from "./ja";

export type Locale = "en" | "ja";

const translations: Record<Locale, Record<TranslationKey, string>> = { en, ja };

function createI18n() {
  let locale = $state<Locale>(loadLocale());

  function loadLocale(): Locale {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("voice-trunk-locale");
      if (saved === "en" || saved === "ja") return saved;
    }
    // Default to Japanese
    return "ja";
  }

  return {
    get locale() { return locale; },
    set locale(v: Locale) {
      locale = v;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("voice-trunk-locale", v);
      }
    },
    t(key: TranslationKey): string {
      return translations[locale][key] ?? key;
    },
  };
}

export const i18n = createI18n();
export function t(key: TranslationKey): string {
  return i18n.t(key);
}
export type { TranslationKey };
