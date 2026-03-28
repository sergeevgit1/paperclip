import { t } from "@/i18n";

export function displayStatus(status: string): string {
  switch (status) {
    case "backlog":
      return t("status.backlog");
    case "todo":
      return t("status.todo");
    case "in_progress":
      return t("status.inProgress");
    case "in_review":
      return t("status.inReview");
    case "blocked":
      return t("status.blocked");
    case "done":
      return t("status.done");
    case "cancelled":
      return t("status.cancelled");
    default:
      return status.replace(/_/g, " ");
  }
}

export function displayPriority(priority: string): string {
  switch (priority) {
    case "critical":
      return t("priority.critical");
    case "high":
      return t("priority.high");
    case "medium":
      return t("priority.medium");
    case "low":
      return t("priority.low");
    default:
      return priority;
  }
}
