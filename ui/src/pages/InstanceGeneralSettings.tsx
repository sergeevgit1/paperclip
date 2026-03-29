import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Shield, SlidersHorizontal } from "lucide-react";
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
        checked ? "border-emerald-500/60 bg-emerald-500/30" : "border-border bg-muted/60",
      )}
      onClick={onToggle}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-[10px] shadow-sm transition-transform",
          checked ? "translate-x-6 text-emerald-500" : "translate-x-1 text-muted-foreground",
        )}
      >
        {checked ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      </span>
    </button>
  );
}

export function InstanceGeneralSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "General" },
    ]);
  }, [setBreadcrumbs]);

  const generalQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) =>
      instanceSettingsApi.updateGeneral({ censorUsernameInLogs: enabled }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update general settings.");
    },
  });

  if (generalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading general settings...</div>;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error
          ? generalQuery.error.message
          : "Failed to load general settings."}
      </div>
    );
  }

  const censorUsernameInLogs = generalQuery.data?.censorUsernameInLogs === true;

  return (
    <div className="w-full space-y-6 pb-6">
      <Card className="border-border/80 bg-card/70 py-0">
        <CardHeader className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">General</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Configure instance-wide defaults that affect operator-facing behavior and log presentation.
              </p>
            </div>
            <Badge variant="outline" className="mt-0.5">Instance-wide</Badge>
          </div>
        </CardHeader>
      </Card>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
      <Card className="py-0 xl:col-span-2">
        <CardContent className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Censor username in logs</h2>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Hide username segments in home-directory paths and similar operator-visible log output. Standalone
                username mentions outside of paths are not yet masked in live transcripts.
              </p>
            </div>
            <SettingToggle
              checked={censorUsernameInLogs}
              disabled={toggleMutation.isPending}
              ariaLabel="Toggle username log censoring"
              onToggle={() => toggleMutation.mutate(!censorUsernameInLogs)}
            />
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
