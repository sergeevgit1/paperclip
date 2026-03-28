import type { Locale } from "./types";

export function formatDateForLocale(
  locale: Locale,
  date: Date | string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(new Date(date));
}

export function formatCurrencyForLocale(
  locale: Locale,
  amount: number,
  currency: string,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount);
}

export function formatNumberForLocale(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
