import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Rocket, ServerCog } from "lucide-react";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SettingToggle({
  checked,
  disabled,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      data-slot="toggle"
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-7 w-12 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-amber-500/60 bg-amber-500/30" : "border-border bg-muted/60",
      )}
      onClick={onToggle}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-[10px] shadow-sm transition-transform",
          checked ? "translate-x-6 text-amber-500" : "translate-x-1 text-muted-foreground",
        )}
      >
        {checked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      </span>
    </button>
  );
}

export function InstanceExperimentalSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "Experimental" },
    ]);
  }, [setBreadcrumbs]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation({
    mutationFn: async (patch: { enableIsolatedWorkspaces?: boolean; autoRestartDevServerWhenIdle?: boolean }) =>
      instanceSettingsApi.updateExperimental(patch),
    onSuccess: async () => {
      setActionError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update experimental settings.");
    },
  });

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading experimental settings...</div>;
  }

  if (experimentalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {experimentalQuery.error instanceof Error
          ? experimentalQuery.error.message
          : "Failed to load experimental settings."}
      </div>
    );
  }

  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;

  return (
    <div className="w-full space-y-6 pb-6">
      <Card className="border-border/80 bg-card/70 py-0">
        <CardHeader className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Experimental</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Opt into features under active evaluation before they become defaults.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
              Beta
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
      <Card className="py-0">
        <CardContent className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Enable isolated workspaces</h2>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Show execution-workspace controls in project configuration and allow isolated workspace behavior for new
                and existing issue runs.
              </p>
            </div>
            <SettingToggle
              checked={enableIsolatedWorkspaces}
              disabled={toggleMutation.isPending}
              ariaLabel="Toggle isolated workspaces experimental setting"
              onToggle={() => toggleMutation.mutate({ enableIsolatedWorkspaces: !enableIsolatedWorkspaces })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardContent className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Auto-restart dev server when idle</h2>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                In `pnpm dev:once`, wait for queued and running local agent runs to finish, then restart the server
                automatically when backend changes or migrations make the current boot stale.
              </p>
            </div>
            <SettingToggle
              checked={autoRestartDevServerWhenIdle}
              disabled={toggleMutation.isPending}
              ariaLabel="Toggle guarded dev-server auto-restart"
              onToggle={() => toggleMutation.mutate({ autoRestartDevServerWhenIdle: !autoRestartDevServerWhenIdle })}
            />
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
