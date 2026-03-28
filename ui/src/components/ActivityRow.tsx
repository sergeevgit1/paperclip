import { Link } from "@/lib/router";
import { Identity } from "./Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { deriveProjectUrlKey, type ActivityEvent, type Agent } from "@paperclipai/shared";
import { t } from "@/i18n";

const ACTION_VERBS: Record<string, string> = {
  "issue.created": t("activityRow.action.created"),
  "issue.updated": t("activityRow.action.updated"),
  "issue.checked_out": t("activityRow.action.checkedOut"),
  "issue.released": t("activityRow.action.released"),
  "issue.comment_added": t("activityRow.action.commentedOn"),
  "issue.attachment_added": t("activityRow.action.attachedFile"),
  "issue.attachment_removed": t("activityRow.action.removedAttachment"),
  "issue.document_created": t("activityRow.action.createdDocument"),
  "issue.document_updated": t("activityRow.action.updatedDocument"),
  "issue.document_deleted": t("activityRow.action.deletedDocument"),
  "issue.commented": t("activityRow.action.commentedOn"),
  "issue.deleted": t("activityRow.action.deleted"),
  "agent.created": t("activityRow.action.created"),
  "agent.updated": t("activityRow.action.updated"),
  "agent.paused": t("activityRow.action.paused"),
  "agent.resumed": t("activityRow.action.resumed"),
  "agent.terminated": t("activityRow.action.terminated"),
  "agent.key_created": t("activityRow.action.createdApiKey"),
  "agent.budget_updated": t("activityRow.action.updatedBudget"),
  "agent.runtime_session_reset": t("activityRow.action.resetSession"),
  "heartbeat.invoked": t("activityRow.action.invokedHeartbeat"),
  "heartbeat.cancelled": t("activityRow.action.cancelledHeartbeat"),
  "approval.created": t("activityRow.action.requestedApproval"),
  "approval.approved": t("activityRow.action.approved"),
  "approval.rejected": t("activityRow.action.rejected"),
  "project.created": t("activityRow.action.created"),
  "project.updated": t("activityRow.action.updated"),
  "project.deleted": t("activityRow.action.deleted"),
  "goal.created": t("activityRow.action.created"),
  "goal.updated": t("activityRow.action.updated"),
  "goal.deleted": t("activityRow.action.deleted"),
  "cost.reported": t("activityRow.action.reportedCost"),
  "cost.recorded": t("activityRow.action.recordedCost"),
  "company.created": t("activityRow.action.createdCompany"),
  "company.updated": t("activityRow.action.updatedCompany"),
  "company.archived": t("activityRow.action.archived"),
  "company.budget_updated": t("activityRow.action.updatedBudget"),
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? t("activityRow.none"));
  return value.replace(/_/g, " ");
}

function formatVerb(action: string, details?: Record<string, unknown> | null): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    if (details.status !== undefined) {
      const from = previous.status;
      return from
        ? t("activityRow.changedStatusFromTo", { from: humanizeValue(from), to: humanizeValue(details.status) })
        : t("activityRow.changedStatusTo", { to: humanizeValue(details.status) });
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      return from
        ? t("activityRow.changedPriorityFromTo", { from: humanizeValue(from), to: humanizeValue(details.priority) })
        : t("activityRow.changedPriorityTo", { to: humanizeValue(details.priority) });
    }
  }
  return ACTION_VERBS[action] ?? action.replace(/[._]/g, " ");
}

function entityLink(entityType: string, entityId: string, name?: string | null): string | null {
  switch (entityType) {
    case "issue": return `/issues/${name ?? entityId}`;
    case "agent": return `/agents/${entityId}`;
    case "project": return `/projects/${deriveProjectUrlKey(name, entityId)}`;
    case "goal": return `/goals/${entityId}`;
    case "approval": return `/approvals/${entityId}`;
    default: return null;
  }
}

interface ActivityRowProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap?: Map<string, string>;
  className?: string;
}

export function ActivityRow({ event, agentMap, entityNameMap, entityTitleMap, className }: ActivityRowProps) {
  const verb = formatVerb(event.action, event.details);

  const isHeartbeatEvent = event.entityType === "heartbeat_run";
  const heartbeatAgentId = isHeartbeatEvent
    ? (event.details as Record<string, unknown> | null)?.agentId as string | undefined
    : undefined;

  const name = isHeartbeatEvent
    ? (heartbeatAgentId ? entityNameMap.get(`agent:${heartbeatAgentId}`) : null)
    : entityNameMap.get(`${event.entityType}:${event.entityId}`);

  const entityTitle = entityTitleMap?.get(`${event.entityType}:${event.entityId}`);

  const link = isHeartbeatEvent && heartbeatAgentId
    ? `/agents/${heartbeatAgentId}/runs/${event.entityId}`
    : entityLink(event.entityType, event.entityId, name);

  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName = actor?.name ?? (event.actorType === "system" ? t("activityRow.system") : event.actorType === "user" ? t("activityRow.board") : event.actorId || t("activityRow.unknown"));

  const inner = (
    <div className="flex gap-3">
      <p className="flex-1 min-w-0 truncate">
        <Identity
          name={actorName}
          size="xs"
          className="align-baseline"
        />
        <span className="text-muted-foreground ml-1">{verb} </span>
        {name && <span className="font-medium">{name}</span>}
        {entityTitle && <span className="text-muted-foreground ml-1">— {entityTitle}</span>}
      </p>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{timeAgo(event.createdAt)}</span>
    </div>
  );

  const classes = cn(
    "px-4 py-2 text-sm",
    link && "cursor-pointer hover:bg-accent/50 transition-colors",
    className,
  );

  if (link) {
    return (
      <Link to={link} className={cn(classes, "no-underline text-inherit block")}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={classes}>
      {inner}
    </div>
  );
}
