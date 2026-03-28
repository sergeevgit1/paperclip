import { createContext, useContext } from "react";
import { enMessages } from "./messages/en";
import { ruMessages } from "./messages/ru";
import { formatCurrencyForLocale, formatDateForLocale, formatNumberForLocale } from "./formatters";
import type { Locale, Messages, TranslationParams, TranslationValue } from "./types";

const LOCALE_STORAGE_KEY = "paperclip.locale";

const messagesByLocale: Record<Locale, Messages> = {
  en: enMessages,
  ru: ruMessages,
};

let currentLocale: Locale = "en";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return "en";
  return input.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return currentLocale;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return normalizeLocale(stored);
  } catch {
    // Ignore local storage read failures in restricted environments.
  }

  return normalizeLocale(window.navigator.language);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore local storage write failures in restricted environments.
  }
}

export function getMessages(locale: Locale = currentLocale): Messages {
  return messagesByLocale[locale] ?? messagesByLocale.en;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}

function resolveTranslationValue(value: TranslationValue | undefined, params?: TranslationParams): string | null {
  if (value == null) return null;
  return typeof value === "function" ? value(params) : value;
}

export function t(key: string, params?: TranslationParams): string {
  const localeMessages = getMessages();
  const fallbackMessages = getMessages("en");
  return (
    resolveTranslationValue(localeMessages.translations[key], params) ??
    resolveTranslationValue(fallbackMessages.translations[key], params) ??
    key
  );
}

export function formatDate(date: Date | string): string {
  return formatDateForLocale(currentLocale, date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return formatDateForLocale(currentLocale, date, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumberForLocale(currentLocale, value, options);
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return formatCurrencyForLocale(currentLocale, amount, currency);
}

export function relativeTimeText(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);
  const messages = getMessages();

  if (seconds < 60) return messages.relativeTime.justNow;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return messages.relativeTime.minuteAgo(minutes);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return messages.relativeTime.hourAgo(hours);

  const days = Math.floor(hours / 24);
  if (days < 7) return messages.relativeTime.dayAgo(days);

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return messages.relativeTime.weekAgo(weeks);

  const months = Math.floor(days / 30);
  return messages.relativeTime.monthAgo(months);
}

export function providerDisplayNameForLocale(provider: string): string {
  return getMessages().providers[provider.toLowerCase()] ?? provider;
}

export function billingTypeDisplayNameForLocale(billingType: string): string {
  return getMessages().billingTypes[billingType] ?? billingType;
}

export function quotaSourceDisplayNameForLocale(source: string): string {
  return getMessages().quotaSources[source] ?? source;
}

export function financeEventKindDisplayNameForLocale(eventKind: string): string {
  return getMessages().financeEventKinds[eventKind] ?? eventKind;
}

export function financeDirectionDisplayNameForLocale(direction: string): string {
  return getMessages().financeDirections[direction] ?? direction;
}
