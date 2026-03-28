export type Locale = "en" | "ru";

export type TranslationParams = Record<string, number | string | null | undefined>;
export type TranslationValue = string | ((params?: TranslationParams) => string);

export interface Messages {
  translations: Record<string, TranslationValue>;
  relativeTime: {
    justNow: string;
    minuteAgo: (count: number) => string;
    hourAgo: (count: number) => string;
    dayAgo: (count: number) => string;
    weekAgo: (count: number) => string;
    monthAgo: (count: number) => string;
  };
  providers: Record<string, string>;
  billingTypes: Record<string, string>;
  quotaSources: Record<string, string>;
  financeEventKinds: Record<string, string>;
  financeDirections: Record<string, string>;
}
