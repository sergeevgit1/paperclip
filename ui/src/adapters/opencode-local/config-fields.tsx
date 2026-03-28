import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  ToggleField,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { t } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint = t("agentConfig.instructionsFileHelp");

function readProviderConfig(config: Record<string, unknown>): Record<string, unknown> {
  return typeof config.openCodeProvider === "object" &&
    config.openCodeProvider !== null &&
    !Array.isArray(config.openCodeProvider)
    ? (config.openCodeProvider as Record<string, unknown>)
    : {};
}

export function OpenCodeLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const providerConfig = readProviderConfig(config);
  const customEnabled = isCreate
    ? Boolean(values!.openCodeCustomProviderEnabled)
    : providerConfig.enabled === true;

  function updateProviderPatch(patch: Record<string, unknown>) {
    mark("adapterConfig", "openCodeProvider", {
      ...providerConfig,
      enabled: true,
      ...patch,
    });
  }

  return (
    <>
      {!hideInstructionsFile && (
        <Field label={t("agentConfig.instructionsFile")} hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder={t("agentConfig.instructionsFilePlaceholder")}
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      <ToggleField
        label={t("agentConfig.skipPermissions")}
        hint={help.dangerouslySkipPermissions}
        checked={
          isCreate
            ? values!.dangerouslySkipPermissions
            : eff(
                "adapterConfig",
                "dangerouslySkipPermissions",
                config.dangerouslySkipPermissions !== false,
              )
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslySkipPermissions: v })
            : mark("adapterConfig", "dangerouslySkipPermissions", v)
        }
      />
      <ToggleField
        label="Custom OpenAI-compatible provider"
        hint="Register a provider in the OpenCode config used by Paperclip and surface its models directly in the OpenCode model picker."
        checked={customEnabled}
        onChange={(v) =>
          isCreate
            ? set!({ openCodeCustomProviderEnabled: v })
            : mark("adapterConfig", "openCodeProvider", v ? { ...providerConfig, enabled: true } : undefined)
        }
      />
      {customEnabled && (
        <>
          <Field label="Provider ID" hint="Unique OpenCode provider slug, used as the provider prefix in provider/model.">
            <DraftInput
              value={
                isCreate
                  ? values!.openCodeCustomProviderId ?? ""
                  : String(providerConfig.id ?? "")
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ openCodeCustomProviderId: v })
                  : updateProviderPatch({ id: v })
              }
              immediate
              className={inputClass}
              placeholder="myprovider"
            />
          </Field>
          <Field label="Provider name" hint="Display label written into the OpenCode provider config.">
            <DraftInput
              value={
                isCreate
                  ? values!.openCodeCustomProviderName ?? ""
                  : String(providerConfig.name ?? "")
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ openCodeCustomProviderName: v })
                  : updateProviderPatch({ name: v })
              }
              immediate
              className={inputClass}
              placeholder="My Provider"
            />
          </Field>
          <Field label="Base URL" hint="OpenAI-compatible base URL, typically ending with /v1.">
            <DraftInput
              value={
                isCreate
                  ? values!.openCodeCustomProviderBaseUrl ?? ""
                  : String(providerConfig.baseURL ?? "")
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ openCodeCustomProviderBaseUrl: v })
                  : updateProviderPatch({ baseURL: v })
              }
              immediate
              className={inputClass}
              placeholder="https://api.example.com/v1"
            />
          </Field>
          <Field label="API key" hint="Paperclip stores this into the OpenCode config it manages for the local OpenCode runtime.">
            <DraftInput
              value={
                isCreate
                  ? values!.openCodeCustomProviderApiKey ?? ""
                  : String(providerConfig.apiKey ?? "")
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ openCodeCustomProviderApiKey: v })
                  : updateProviderPatch({ apiKey: v })
              }
              immediate
              className={inputClass}
              placeholder="sk-..."
            />
          </Field>
          <Field label="Extra headers JSON" hint="Optional provider.options.headers object for gateways like Helicone or custom proxies.">
            <MarkdownEditor
              value={
                isCreate
                  ? values!.openCodeCustomProviderHeadersJson ?? ""
                  : JSON.stringify(
                      (typeof providerConfig.headers === "object" && providerConfig.headers !== null
                        ? providerConfig.headers
                        : {}) as Record<string, unknown>,
                      null,
                      2,
                    )
              }
              onChange={(v) => {
                if (isCreate) {
                  set!({ openCodeCustomProviderHeadersJson: v ?? "" });
                  return;
                }
                try {
                  const parsed = JSON.parse(v ?? "{}");
                  updateProviderPatch({ headers: parsed });
                } catch {
                  updateProviderPatch({ headers: {} });
                }
              }}
              placeholder='{"Helicone-User-Id": "paperclip"}'
              contentClassName="min-h-[72px] text-sm font-mono"
            />
          </Field>
        </>
      )}
    </>
  );
}
