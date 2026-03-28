import { useCallback, useMemo, useState, type ReactNode } from "react";
import { I18nContext, detectInitialLocale, setLocale as setGlobalLocale, t } from "./index";
import type { Locale } from "./types";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [localeState, setLocaleState] = useState<Locale>(() => {
    const locale = detectInitialLocale();
    setGlobalLocale(locale);
    return locale;
  });

  const setLocale = useCallback((locale: Locale) => {
    setGlobalLocale(locale);
    setLocaleState(locale);
  }, []);

  const value = useMemo(
    () => ({
      locale: localeState,
      setLocale,
      t,
    }),
    [localeState, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
