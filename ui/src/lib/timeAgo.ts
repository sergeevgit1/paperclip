import { relativeTimeText } from "@/i18n";

export function timeAgo(date: Date | string): string {
  return relativeTimeText(date);
}
