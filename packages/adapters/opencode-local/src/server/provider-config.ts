import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface OpenCodeCustomProviderRegistrationInput {
  providerId: string;
  providerName?: string | null;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

export interface OpenCodeCustomProviderRegistrationResult {
  providerId: string;
  providerName: string;
  baseURL: string;
  models: Array<{ id: string; label: string }>;
  configPath: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveXdgConfigHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.XDG_CONFIG_HOME?.trim();
  if (configured) return configured;
  return path.join(os.homedir(), ".config");
}

export function resolveOpenCodeSourceConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveXdgConfigHome(env), "opencode", "opencode.json");
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function toDisplayName(providerId: string, providerName?: string | null): string {
  const explicit = providerName?.trim();
  return explicit && explicit.length > 0 ? explicit : providerId;
}

async function readConfigObject(configPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(configPath, "utf8").catch((err: NodeJS.ErrnoException) => {
    if (err?.code === "ENOENT") return "";
    throw err;
  });
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      $schema: "https://opencode.ai/config.json",
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `OpenCode config is not valid JSON: ${configPath}. Convert it to JSON before using Paperclip provider registration.`,
    );
  }
  const record = asRecord(parsed);
  if (!record) {
    throw new Error(`OpenCode config must be a JSON object: ${configPath}`);
  }
  return record;
}

function buildModelsEndpoint(baseURL: string): string {
  return new URL("models", `${normalizeBaseUrl(baseURL)}/`).toString();
}

function normalizeHeaders(
  apiKey: string,
  headers: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};
  let hasAuthorization = false;
  for (const [key, value] of Object.entries(headers)) {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) continue;
    if (trimmedKey.toLowerCase() === "authorization") hasAuthorization = true;
    next[trimmedKey] = trimmedValue;
  }
  if (!hasAuthorization) {
    next.Authorization = `Bearer ${apiKey}`;
  }
  return next;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof (data as { error?: unknown } | null)?.error === "string"
          ? (data as { error: string }).error
          : typeof (data as { message?: unknown } | null)?.message === "string"
            ? (data as { message: string }).message
            : `HTTP ${response.status}`;
      throw new Error(`Model discovery failed: ${message}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function parseModelIds(payload: unknown): string[] {
  const record = asRecord(payload);
  const rows = Array.isArray(record?.data)
    ? record?.data
    : Array.isArray(payload)
      ? payload
      : [];
  const ids = rows
    .map((row) => asRecord(row))
    .map((row) => (typeof row?.id === "string" ? row.id.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

export async function discoverOpenAiCompatibleModels(input: {
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<Array<{ id: string; label: string }>> {
  const endpoint = buildModelsEndpoint(input.baseURL);
  const payload = await fetchJsonWithTimeout(
    endpoint,
    {
      method: "GET",
      headers: normalizeHeaders(input.apiKey, input.headers),
    },
    input.timeoutMs ?? 20_000,
  );
  return parseModelIds(payload).map((id) => ({ id, label: id }));
}

export function buildOpenCodeCustomProviderEntry(input: {
  providerId: string;
  providerName: string;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
  models: Array<{ id: string; label: string }>;
}): Record<string, unknown> {
  return {
    npm: "@ai-sdk/openai-compatible",
    name: input.providerName,
    options: {
      baseURL: input.baseURL,
      apiKey: input.apiKey,
      ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
    },
    models: Object.fromEntries(
      input.models.map((model) => [model.id, { name: model.label }]),
    ),
  };
}

export async function registerOpenCodeCustomProvider(
  input: OpenCodeCustomProviderRegistrationInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OpenCodeCustomProviderRegistrationResult> {
  const providerId = normalizeProviderId(input.providerId);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(providerId)) {
    throw new Error("Provider ID must contain only letters, numbers, dots, underscores, or hyphens.");
  }
  const providerName = toDisplayName(providerId, input.providerName);
  const baseURL = normalizeBaseUrl(input.baseURL);
  if (!baseURL) {
    throw new Error("Base URL is required.");
  }
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const headers = normalizeHeaders(apiKey, input.headers);
  const models = await discoverOpenAiCompatibleModels({ baseURL, apiKey, headers: input.headers });
  if (models.length === 0) {
    throw new Error("Provider returned no models from the OpenAI-compatible /models endpoint.");
  }

  const configPath = resolveOpenCodeSourceConfigPath(env);
  const configDir = path.dirname(configPath);
  await fs.mkdir(configDir, { recursive: true });
  const currentConfig = await readConfigObject(configPath);
  const providerConfig = asRecord(currentConfig.provider) ?? {};

  providerConfig[providerId] = buildOpenCodeCustomProviderEntry({
    providerId,
    providerName,
    baseURL,
    apiKey,
    headers: input.headers,
    models,
  });

  const nextConfig = {
    ...currentConfig,
    $schema:
      typeof currentConfig.$schema === "string" && currentConfig.$schema.trim().length > 0
        ? currentConfig.$schema
        : "https://opencode.ai/config.json",
    provider: providerConfig,
  };

  await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return {
    providerId,
    providerName,
    baseURL,
    models,
    configPath,
  };
}
