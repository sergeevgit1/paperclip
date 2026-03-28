import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { asBoolean } from "@paperclipai/adapter-utils/server-utils";
import { buildOpenCodeCustomProviderEntry } from "./provider-config.js";

type PreparedOpenCodeRuntimeConfig = {
  env: Record<string, string>;
  notes: string[];
  cleanup: () => Promise<void>;
};

const AMBIENT_OPENCODE_ENV_KEYS = [
  "OPENCODE",
  "OPENCODE_PID",
  "OPENCODE_CLIENT",
  "OPENCODE_SERVER_USERNAME",
  "OPENCODE_SERVER_PASSWORD",
  "OPENCODE_EXPERIMENTAL_FILEWATCHER",
  "OPENCODE_EXPERIMENTAL_ICON_DISCOVERY",
] as const;

export function sanitizeOpenCodeAmbientEnv(env: Record<string, string>): Record<string, string> {
  const next = { ...env };
  for (const key of AMBIENT_OPENCODE_ENV_KEYS) {
    delete next[key];
  }
  return next;
}

function resolveXdgConfigHome(env: Record<string, string>): string {
  return (
    (typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.trim()) ||
    (typeof process.env.XDG_CONFIG_HOME === "string" && process.env.XDG_CONFIG_HOME.trim()) ||
    path.join(os.homedir(), ".config")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && key.trim().length > 0 && entry.trim().length > 0) {
      out[key] = entry;
    }
  }
  return out;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function normalizeCustomProviderConfig(config: Record<string, unknown>) {
  const provider = isPlainObject(config.openCodeProvider) ? config.openCodeProvider : null;
  if (!provider || provider.enabled !== true) return null;
  const providerId = typeof provider.id === "string" ? provider.id.trim() : "";
  const baseURL = typeof provider.baseURL === "string" ? provider.baseURL.trim() : "";
  const apiKey = typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
  if (!providerId || !baseURL || !apiKey) return null;
  return {
    providerId,
    providerName: typeof provider.name === "string" ? provider.name.trim() : providerId,
    baseURL,
    apiKey,
    headers: asStringRecord(provider.headers),
    models: asStringList(provider.models),
  };
}

async function readJsonObject(filepath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filepath, "utf8");
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function prepareOpenCodeRuntimeConfig(input: {
  env: Record<string, string>;
  config: Record<string, unknown>;
}): Promise<PreparedOpenCodeRuntimeConfig> {
  const skipPermissions = asBoolean(input.config.dangerouslySkipPermissions, true);
  if (!skipPermissions) {
    return {
      env: input.env,
      notes: [],
      cleanup: async () => {},
    };
  }

  const sourceConfigDir = path.join(resolveXdgConfigHome(input.env), "opencode");
  const runtimeConfigHome = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-config-"));
  const runtimeConfigDir = path.join(runtimeConfigHome, "opencode");
  const runtimeConfigPath = path.join(runtimeConfigDir, "opencode.json");

  await fs.mkdir(runtimeConfigDir, { recursive: true });
  try {
    await fs.cp(sourceConfigDir, runtimeConfigDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
      dereference: false,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") {
      throw err;
    }
  }

  const existingConfig = await readJsonObject(runtimeConfigPath);
  const existingPermission = isPlainObject(existingConfig.permission)
    ? existingConfig.permission
    : {};
  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    permission: {
      ...existingPermission,
      external_directory: "allow",
    },
  };

  const customProvider = normalizeCustomProviderConfig(input.config);
  if (customProvider) {
    const existingProviders = isPlainObject(nextConfig.provider) ? nextConfig.provider : {};
    const providerModels = Object.fromEntries(
      customProvider.models.map((modelId) => [modelId, { name: modelId }]),
    );
    existingProviders[customProvider.providerId] = buildOpenCodeCustomProviderEntry({
      providerId: customProvider.providerId,
      providerName: customProvider.providerName,
      baseURL: customProvider.baseURL,
      apiKey: customProvider.apiKey,
      headers: customProvider.headers,
      models: customProvider.models.map((modelId) => ({ id: modelId, label: modelId })),
    });
    if (Object.keys(providerModels).length > 0) {
      const providerEntry = isPlainObject(existingProviders[customProvider.providerId])
        ? (existingProviders[customProvider.providerId] as Record<string, unknown>)
        : {};
      existingProviders[customProvider.providerId] = {
        ...providerEntry,
        models: providerModels,
      };
    }
    nextConfig.provider = existingProviders;
  }
  await fs.writeFile(runtimeConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return {
    env: {
      ...input.env,
      XDG_CONFIG_HOME: runtimeConfigHome,
    },
    notes: [
      "Injected runtime OpenCode config with permission.external_directory=allow to avoid headless approval prompts.",
    ],
    cleanup: async () => {
      await fs.rm(runtimeConfigHome, { recursive: true, force: true });
    },
  };
}
