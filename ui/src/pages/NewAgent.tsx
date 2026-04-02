import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { agentsApi } from "../api/agents";
import { companySkillsApi } from "../api/companySkills";
import { queryKeys } from "../lib/queryKeys";
import { AGENT_ROLES } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Shield } from "lucide-react";
import { cn, agentUrl } from "../lib/utils";
import { roleLabels } from "../components/agent-config-primitives";
import { AgentConfigForm, type CreateConfigValues } from "../components/AgentConfigForm";
import { defaultCreateValues } from "../components/agent-config-defaults";
import { getUIAdapter } from "../adapters";
import { ReportsToPicker } from "../components/ReportsToPicker";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SUPPORTED_ADVANCED_ADAPTER_TYPES = new Set<CreateConfigValues["adapterType"]>([
  "claude_local",
  "codex_local",
  "gemini_local",
  "opencode_local",
  "pi_local",
  "cursor",
  "hermes_local",
  "openclaw_gateway",
]);

function createValuesForAdapterType(
  adapterType: CreateConfigValues["adapterType"],
): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = { ...defaults, adapterType };
  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox =
      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
  } else if (adapterType === "opencode_local") {
    nextValues.model = "";
  }
  return nextValues;
}

export function NewAgent() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetAdapterType = searchParams.get("adapterType");

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [role, setRole] = useState("general");
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<CreateConfigValues>(defaultCreateValues);
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [roleOpen, setRoleOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, configValues.adapterType)
      : ["agents", "none", "adapter-models", configValues.adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, configValues.adapterType),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: companySkills } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? ""),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const isFirstAgent = !agents || agents.length === 0;
  const effectiveRole = isFirstAgent ? "ceo" : role;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Agents", href: "/agents" },
      { label: "New Agent" },
    ]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (isFirstAgent) {
      if (!name) setName("CEO");
      if (!title) setTitle("CEO");
    }
  }, [isFirstAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const requested = presetAdapterType;
    if (!requested) return;
    if (!SUPPORTED_ADVANCED_ADAPTER_TYPES.has(requested as CreateConfigValues["adapterType"])) {
      return;
    }
    setConfigValues((prev) => {
      if (prev.adapterType === requested) return prev;
      return createValuesForAdapterType(requested as CreateConfigValues["adapterType"]);
    });
  }, [presetAdapterType]);

  const createAgent = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      agentsApi.hire(selectedCompanyId!, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      if (result.approval) {
        navigate(`/approvals/${result.approval.id}`);
        return;
      }
      navigate(agentUrl(result.agent));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Failed to create agent");
    },
  });

  function buildAdapterConfig() {
    const adapter = getUIAdapter(configValues.adapterType);
    return adapter.buildAdapterConfig(configValues);
  }

  function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    setFormError(null);
    if (configValues.adapterType === "opencode_local") {
      const selectedModel = configValues.model.trim();
      if (!selectedModel) {
        setFormError("OpenCode requires an explicit model in provider/model format.");
        return;
      }
      if (adapterModelsError) {
        setFormError(
          adapterModelsError instanceof Error
            ? adapterModelsError.message
            : "Failed to load OpenCode models.",
        );
        return;
      }
      if (adapterModelsLoading || adapterModelsFetching) {
        setFormError("OpenCode models are still loading. Please wait and try again.");
        return;
      }
      const discovered = adapterModels ?? [];
      if (!discovered.some((entry) => entry.id === selectedModel)) {
        setFormError(
          discovered.length === 0
            ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
            : `Configured OpenCode model is unavailable: ${selectedModel}`,
        );
        return;
      }
    }
    createAgent.mutate({
      name: name.trim(),
      role: effectiveRole,
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(capabilities.trim() ? { capabilities: capabilities.trim() } : {}),
      ...(reportsTo ? { reportsTo } : {}),
      ...(selectedSkillKeys.length > 0 ? { desiredSkills: selectedSkillKeys } : {}),
      adapterType: configValues.adapterType,
      adapterConfig: buildAdapterConfig(),
      runtimeConfig: {
        heartbeat: {
          enabled: configValues.heartbeatEnabled,
          intervalSec: configValues.intervalSec,
          wakeOnDemand: true,
          cooldownSec: 10,
          maxConcurrentRuns: 1,
        },
      },
      budgetMonthlyCents: 0,
    });
  }

  const payloadPreview = useMemo(() => ({
    name: name.trim(),
    role: effectiveRole,
    ...(title.trim() ? { title: title.trim() } : {}),
    ...(capabilities.trim() ? { capabilities: capabilities.trim() } : {}),
    ...(reportsTo ? { reportsTo } : {}),
    ...(selectedSkillKeys.length > 0 ? { desiredSkills: selectedSkillKeys } : {}),
    adapterType: configValues.adapterType,
    adapterConfig: buildAdapterConfig(),
    runtimeConfig: {
      heartbeat: {
        enabled: configValues.heartbeatEnabled,
        intervalSec: configValues.intervalSec,
        wakeOnDemand: true,
        cooldownSec: 10,
        maxConcurrentRuns: 1,
      },
    },
    budgetMonthlyCents: 0,
  }), [
    capabilities,
    configValues,
    effectiveRole,
    name,
    reportsTo,
    selectedSkillKeys,
    title,
  ]);

  const managerName = useMemo(() => {
    if (!reportsTo) return null;
    return (agents ?? []).find((agent) => agent.id === reportsTo)?.name ?? null;
  }, [agents, reportsTo]);

  const preflightErrors = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Agent name is required.");
    if (configValues.adapterType === "opencode_local") {
      const selectedModel = configValues.model.trim();
      if (!selectedModel) {
        errors.push("OpenCode requires an explicit model in provider/model format.");
      } else if (!adapterModelsLoading && !adapterModelsFetching && !adapterModelsError) {
        const discovered = adapterModels ?? [];
        if (!discovered.some((entry) => entry.id === selectedModel)) {
          errors.push(
            discovered.length === 0
              ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
              : `Configured OpenCode model is unavailable: ${selectedModel}`,
          );
        }
      }
      if (adapterModelsError) {
        errors.push(adapterModelsError instanceof Error ? adapterModelsError.message : "Failed to load OpenCode models.");
      }
      if (adapterModelsLoading || adapterModelsFetching) {
        errors.push("OpenCode models are still loading.");
      }
    }
    return errors;
  }, [
    name,
    configValues.adapterType,
    configValues.model,
    adapterModels,
    adapterModelsError,
    adapterModelsFetching,
    adapterModelsLoading,
  ]);

  const preflightWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!reportsTo && !isFirstAgent) warnings.push("No manager selected. Agent will not report to anyone.");
    if (selectedSkillKeys.length === 0) warnings.push("No optional company skills selected.");
    return warnings;
  }, [reportsTo, isFirstAgent, selectedSkillKeys.length]);

  const willRequireApproval = Boolean(selectedCompany?.requireBoardApprovalForNewAgents);
  const instructionFiles = effectiveRole === "ceo"
    ? ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"]
    : ["AGENTS.md"];

  function goNext() {
    if (step === 1) {
      if (!name.trim()) {
        setFormError("Agent name is required.");
        return;
      }
      setFormError(null);
      setStep(2);
      return;
    }
    if (step === 2) {
      if (configValues.adapterType === "opencode_local") {
        const selectedModel = configValues.model.trim();
        if (!selectedModel) {
          setFormError("OpenCode requires an explicit model in provider/model format.");
          return;
        }
      }
      setFormError(null);
      setStep(3);
      return;
    }
    if (step === 3) {
      setFormError(null);
      setStep(4);
    }
  }

  function goBack() {
    if (step === 1) return;
    setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4);
  }

  const availableSkills = (companySkills ?? []).filter((skill) => !skill.key.startsWith("paperclipai/paperclip/"));

  function toggleSkill(key: string, checked: boolean) {
    setSelectedSkillKeys((prev) => {
      if (checked) {
        return prev.includes(key) ? prev : [...prev, key];
      }
      return prev.filter((value) => value !== key);
    });
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Hire Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">Guided onboarding with preflight checks before submit.</p>
        </div>
        <Badge variant="outline">Step {step} of 4</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { id: 1, label: "Role & Goal" },
          { id: 2, label: "Adapter & Runtime" },
          { id: 3, label: "Manager & Skills" },
          { id: 4, label: "Preflight" },
        ].map((item) => (
          <Card key={item.id} className={cn("py-0", step === item.id && "border-primary")}> 
            <CardContent className="px-3 py-2">
              <div className="text-xs text-muted-foreground">{item.id}</div>
              <div className="text-sm font-medium">{item.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {step === 1 && (
        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Role & Goal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 border-t px-4 py-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-2 text-sm outline-none"
                placeholder="Agent name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Title</label>
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-2 text-sm outline-none"
                placeholder="Title (e.g. VP of Engineering)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role</label>
              <Popover open={roleOpen} onOpenChange={setRoleOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 transition-colors",
                      isFirstAgent && "opacity-60 cursor-not-allowed",
                    )}
                    disabled={isFirstAgent}
                  >
                    <Shield className="h-3 w-3 text-muted-foreground" />
                    {roleLabels[effectiveRole] ?? effectiveRole}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-36 p-1" align="start">
                  {AGENT_ROLES.map((r) => (
                    <button
                      key={r}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50",
                        r === role && "bg-accent",
                      )}
                      onClick={() => {
                        setRole(r);
                        setRoleOpen(false);
                      }}
                    >
                      {roleLabels[r] ?? r}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Mission / capabilities</label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-border bg-transparent px-2.5 py-2 text-sm outline-none"
                placeholder="What this agent is responsible for and how it should operate"
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
              />
            </div>
            {isFirstAgent && <p className="text-xs text-muted-foreground">This will be the CEO.</p>}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Adapter & Runtime</CardTitle>
          </CardHeader>
          <CardContent className="border-t px-0 py-0">
            <AgentConfigForm
              mode="create"
              values={configValues}
              onChange={(patch) => setConfigValues((prev) => ({ ...prev, ...patch }))}
              adapterModels={adapterModels}
            />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="py-0">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm">Manager</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 border-t px-4 py-4">
              <ReportsToPicker
                agents={agents ?? []}
                value={reportsTo}
                onChange={setReportsTo}
                disabled={isFirstAgent}
              />
              <p className="text-xs text-muted-foreground">
                {managerName ? `Reports to ${managerName}` : "No manager selected"}
              </p>
            </CardContent>
          </Card>

          <Card className="py-0">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm">Skills</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 border-t px-4 py-4">
              <p className="text-xs text-muted-foreground">
                Optional skills from the company library. Built-in Paperclip runtime skills are added automatically.
              </p>
              {availableSkills.length === 0 ? (
                <p className="text-xs text-muted-foreground">No optional company skills installed yet.</p>
              ) : (
                <div className="space-y-3">
                  {availableSkills.map((skill) => {
                    const inputId = `skill-${skill.id}`;
                    const checked = selectedSkillKeys.includes(skill.key);
                    return (
                      <div key={skill.id} className="flex items-start gap-3">
                        <Checkbox
                          id={inputId}
                          checked={checked}
                          onCheckedChange={(next) => toggleSkill(skill.key, next === true)}
                        />
                        <label htmlFor={inputId} className="grid gap-1 leading-none">
                          <span className="text-sm font-medium">{skill.name}</span>
                          <span className="text-xs text-muted-foreground">{skill.description ?? skill.key}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {step === 4 && (
        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Preflight Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 border-t px-4 py-4">
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Agent</div>
                <div className="font-medium">{name.trim() || "(missing name)"}</div>
                <div className="text-xs text-muted-foreground">{roleLabels[effectiveRole] ?? effectiveRole}</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Execution</div>
                <div className="font-medium">{configValues.adapterType}</div>
                <div className="text-xs text-muted-foreground">Heartbeat every {configValues.intervalSec}s</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Instructions files</div>
                <div className="font-medium">{instructionFiles.join(", ")}</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Governance</div>
                <div className="font-medium">
                  {willRequireApproval ? "Will create pending approval" : "Will create agent immediately"}
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">Manager</div>
              <div className="font-medium">{managerName ?? "None"}</div>
            </div>

            <div className="rounded-md border border-border px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground">Desired skills</div>
              <div className="font-medium">{selectedSkillKeys.length > 0 ? selectedSkillKeys.join(", ") : "None"}</div>
            </div>

            {preflightErrors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <div className="font-medium">Fix before submit</div>
                <ul className="mt-1 list-disc pl-4">
                  {preflightErrors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {preflightWarnings.length > 0 && (
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <div className="font-medium">Warnings</div>
                <ul className="mt-1 list-disc pl-4">
                  {preflightWarnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Request payload preview</div>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-xs font-mono">
                {JSON.stringify(payloadPreview, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {formError && <p className="text-sm text-destructive">{formError}</p>}

      <div className="flex items-center justify-between gap-2">
        <div>
          <Button variant="outline" size="sm" onClick={() => navigate("/agents")}>Cancel</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goBack} disabled={step === 1 || createAgent.isPending}>
            Back
          </Button>
          {step < 4 ? (
            <Button size="sm" onClick={goNext} disabled={createAgent.isPending}>Next</Button>
          ) : (
            <Button
              size="sm"
              disabled={!name.trim() || createAgent.isPending || preflightErrors.length > 0}
              onClick={handleSubmit}
            >
              {createAgent.isPending
                ? "Submitting..."
                : willRequireApproval
                  ? "Submit for approval"
                  : "Create agent"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
