import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensurePathInEnv, runChildProcess } from "@paperclipai/adapter-utils/server-utils";

function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

function resolvePaperclipHomeDir(): string {
  const envHome = process.env.PAPERCLIP_HOME?.trim();
  if (envHome) return path.resolve(expandHomePrefix(envHome));
  return path.resolve(os.homedir(), ".paperclip");
}

function resolvePaperclipInstanceId(): string {
  return process.env.PAPERCLIP_INSTANCE_ID?.trim() || "default";
}

export function resolveManagedOpenCodePrefix(): string {
  return path.resolve(resolvePaperclipHomeDir(), "instances", resolvePaperclipInstanceId(), "tools", "opencode");
}

export function resolveManagedOpenCodeCommand(): string {
  const binName = process.platform === "win32" ? "opencode.cmd" : "opencode";
  return path.resolve(resolveManagedOpenCodePrefix(), "bin", binName);
}

export type ManagedOpenCodeStatus = {
  installed: boolean;
  command: string;
  prefix: string;
  version: string | null;
};

export async function getManagedOpenCodeStatus(): Promise<ManagedOpenCodeStatus> {
  const command = resolveManagedOpenCodeCommand();
  const prefix = resolveManagedOpenCodePrefix();
  if (!fs.existsSync(command)) {
    return { installed: false, command, prefix, version: null };
  }

  const proc = await runChildProcess(
    `opencode-version-${Date.now()}`,
    command,
    ["--version"],
    {
      cwd: prefix,
      env: Object.fromEntries(
        Object.entries(ensurePathInEnv(process.env)).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      timeoutSec: 20,
      graceSec: 2,
      onLog: async () => {},
    },
  ).catch(() => null);

  const version = proc
    ? `${proc.stdout}\n${proc.stderr}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) ?? null
    : null;

  return {
    installed: true,
    command,
    prefix,
    version,
  };
}

export async function installManagedOpenCode(): Promise<ManagedOpenCodeStatus> {
  const prefix = resolveManagedOpenCodePrefix();
  await fs.promises.mkdir(prefix, { recursive: true });

  const env = Object.fromEntries(
    Object.entries(ensurePathInEnv(process.env)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const install = await runChildProcess(
    `opencode-install-${Date.now()}`,
    "npm",
    ["install", "-g", "opencode-ai", "--prefix", prefix],
    {
      cwd: prefix,
      env,
      timeoutSec: 300,
      graceSec: 10,
      onLog: async () => {},
    },
  );

  if (install.timedOut) {
    throw new Error("OpenCode install timed out.");
  }
  if ((install.exitCode ?? 1) !== 0) {
    const detail = `${install.stderr}\n${install.stdout}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    throw new Error(detail ? `OpenCode install failed: ${detail}` : "OpenCode install failed.");
  }

  return getManagedOpenCodeStatus();
}
