import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Clock3, ExternalLink, Settings } from "lucide-react";
import type { InstanceSchedulerHeartbeatAgent } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "../lib/queryKeys";
import { formatDateTime, relativeTime } from "../lib/utils";
import { useI18n } from "@/i18n";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function buildAgentHref(agent: InstanceSchedulerHeartbeatAgent) {
  return `/${agent.companyIssuePrefix}/agents/${encodeURIComponent(agent.agentUrlKey)}`;
}

export function InstanceSettings() {
  const { t } = useI18n();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instanceSidebar.title") },
      { label: t("instanceSidebar.heartbeats") },
    ]);
  }, [setBreadcrumbs, t]);

  const heartbeatsQuery = useQuery({
    queryKey: queryKeys.instance.schedulerHeartbeats,
    queryFn: () => heartbeatsApi.listInstanceSchedulerAgents(),
    refetchInterval: 15_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (agentRow: InstanceSchedulerHeartbeatAgent) => {
      const agent = await agentsApi.get(agentRow.id, agentRow.companyId);
      const runtimeConfig = asRecord(agent.runtimeConfig) ?? {};
      const heartbeat = asRecord(runtimeConfig.heartbeat) ?? {};

      return agentsApi.update(
        agentRow.id,
        {
          runtimeConfig: {
            ...runtimeConfig,
            heartbeat: {
              ...heartbeat,
              enabled: !agentRow.heartbeatEnabled,
            },
          },
        },
        agentRow.companyId,
      );
    },
    onSuccess: async (_, agentRow) => {
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.schedulerHeartbeats }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(agentRow.companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentRow.id) }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("instance.failedUpdateHeartbeat"));
    },
  });

  const disableAllMutation = useMutation({
    mutationFn: async (agentRows: InstanceSchedulerHeartbeatAgent[]) => {
      const enabled = agentRows.filter((a) => a.heartbeatEnabled);
      if (enabled.length === 0) return enabled;

      const results = await Promise.allSettled(
        enabled.map(async (agentRow) => {
          const agent = await agentsApi.get(agentRow.id, agentRow.companyId);
          const runtimeConfig = asRecord(agent.runtimeConfig) ?? {};
          const heartbeat = asRecord(runtimeConfig.heartbeat) ?? {};
          await agentsApi.update(
            agentRow.id,
            {
              runtimeConfig: {
                ...runtimeConfig,
                heartbeat: { ...heartbeat, enabled: false },
              },
            },
            agentRow.companyId,
          );
        }),
      );

      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) {
        const firstError = failures[0]?.reason;
        const detail = firstError instanceof Error ? firstError.message : "Unknown error";
        throw new Error(
          failures.length === 1
            ? `Failed to disable 1 timer heartbeat: ${detail}`
            : `Failed to disable ${failures.length} of ${enabled.length} timer heartbeats. First error: ${detail}`,
        );
      }
      return enabled;
    },
    onSuccess: async (updatedRows) => {
      setActionError(null);
      const companies = new Set(updatedRows.map((row) => row.companyId));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.schedulerHeartbeats }),
        ...Array.from(companies, (companyId) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) }),
        ),
        ...updatedRows.map((row) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(row.id) }),
        ),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : t("instance.failedDisableAll"));
    },
  });

  const agents = heartbeatsQuery.data ?? [];
  const activeCount = agents.filter((agent) => agent.schedulerActive).length;
  const disabledCount = agents.length - activeCount;
  const enabledCount = agents.filter((agent) => agent.heartbeatEnabled).length;
  const anyEnabled = enabledCount > 0;

  const grouped = useMemo(() => {
    const map = new Map<string, { companyName: string; agents: InstanceSchedulerHeartbeatAgent[] }>();
    for (const agent of agents) {
      let group = map.get(agent.companyId);
      if (!group) {
        group = { companyName: agent.companyName, agents: [] };
        map.set(agent.companyId, group);
      }
      group.agents.push(agent);
    }
    return [...map.values()];
  }, [agents]);

  if (heartbeatsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("instance.loadingHeartbeats")}</div>;
  }

  if (heartbeatsQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {heartbeatsQuery.error instanceof Error
          ? heartbeatsQuery.error.message
          : t("instance.failedLoadHeartbeats")}
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-6">
      <Card className="border-border/80 bg-card/70 py-0">
        <CardHeader className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{t("instance.title")}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">{t("instance.subtitle")}</p>
            </div>
            <Badge variant="outline" className="mt-0.5">
              Scheduler
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-0">
          <CardContent className="px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("instance.active")}</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <Activity className="h-4 w-4 text-emerald-500" />
              {activeCount}
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("instance.disabled")}</div>
            <div className="mt-1 text-lg font-semibold">{disabledCount}</div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Companies</div>
            <div className="mt-1 text-lg font-semibold">{grouped.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{enabledCount}</span> timer heartbeats enabled
        </span>
        {anyEnabled && (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto h-7 text-xs"
            disabled={disableAllMutation.isPending}
            onClick={() => {
              const noun = enabledCount === 1 ? "agent" : "agents";
              if (!window.confirm(t("instance.confirmDisableAll", { count: enabledCount, noun }))) {
                return;
              }
              disableAllMutation.mutate(agents);
            }}
          >
            {disableAllMutation.isPending ? t("instance.disabling") : t("instance.disableAll")}
          </Button>
        )}
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {agents.length === 0 ? (
        <EmptyState
          icon={Clock3}
          message={t("instance.emptyHeartbeats")}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Card key={group.companyName} className="py-0">
              <CardContent className="p-0">
                <div className="border-b bg-muted/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.companyName} · {group.agents.length}
                </div>
                <div className="divide-y">
                  {group.agents.map((agent) => {
                    const saving = toggleMutation.isPending && toggleMutation.variables?.id === agent.id;
                    return (
                      <div
                        key={agent.id}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm"
                      >
                        <Badge
                          variant={agent.schedulerActive ? "default" : "outline"}
                          className="shrink-0 text-[10px] px-1.5 py-0"
                        >
                          {agent.schedulerActive ? t("instance.on") : t("instance.off")}
                        </Badge>
                        <Link
                          to={buildAgentHref(agent)}
                          className="font-medium truncate hover:underline"
                        >
                          {agent.agentName}
                        </Link>
                        <span className="hidden sm:inline text-muted-foreground truncate">
                          {humanize(agent.title ?? agent.role)}
                        </span>
                        <span className="text-muted-foreground tabular-nums shrink-0">
                          {agent.intervalSec}s
                        </span>
                        <span
                          className="hidden md:inline text-muted-foreground truncate"
                          title={agent.lastHeartbeatAt ? formatDateTime(agent.lastHeartbeatAt) : undefined}
                        >
                          {agent.lastHeartbeatAt
                            ? relativeTime(agent.lastHeartbeatAt)
                            : t("instance.never")}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                          <Link
                            to={buildAgentHref(agent)}
                            className="text-muted-foreground hover:text-foreground"
                             title={t("instance.fullAgentConfig")}
                           >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={saving}
                            onClick={() => toggleMutation.mutate(agent)}
                          >
                             {saving ? "..." : agent.heartbeatEnabled ? t("instance.disableTimerHeartbeat") : t("instance.enableTimerHeartbeat")}
                           </Button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
