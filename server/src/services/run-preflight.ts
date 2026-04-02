import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { issues, projectWorkspaces, projects } from "@paperclipai/db";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  resolveDefaultAgentWorkspaceDir,
  resolveManagedProjectWorkspaceDir as resolveManagedProjectWorkspaceDirFromHomePaths,
} from "../home-paths.js";
import { agentInstructionsService } from "./agent-instructions.js";

export type RunPreflightSeverity = "info" | "warn" | "error";

export interface RunPreflightCheck {
  code: string;
  severity: RunPreflightSeverity;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface RunPreflightReport {
  ok: boolean;
  checks: RunPreflightCheck[];
}

export interface ProjectDiagnostics {
  projectId: string;
  companyId: string;
  projectName: string;
  hasPrimaryWorkspace: boolean;
  workspaceCount: number;
  workspaces: Array<{
    id: string;
    name: string;
    isPrimary: boolean;
    sourceType: string;
    cwd: string | null;
    cwdExists: boolean;
    rootEntryCount: number | null;
    repoUrl: string | null;
  }>;
  managedFolder: string;
  managedFolderExists: boolean;
  managedFolderEntryCount: number | null;
  codebaseReady: boolean;
  warnings: string[];
}

type AgentRowLike = {
  id: string;
  companyId: string;
  name: string;
  adapterConfig: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function directoryExists(targetPath: string): Promise<boolean> {
  return fs.stat(targetPath).then((stats) => stats.isDirectory()).catch(() => false);
}

async function countDirectoryEntries(targetPath: string): Promise<number | null> {
  try {
    const entries = await fs.readdir(targetPath);
    return entries.length;
  } catch {
    return null;
  }
}

async function rootLooksLikeCodebase(targetPath: string): Promise<boolean> {
  try {
    const entries = new Set(await fs.readdir(targetPath));
    return [
      "package.json",
      "pnpm-workspace.yaml",
      "turbo.json",
      "Cargo.toml",
      "go.mod",
      "pyproject.toml",
      ".git",
      "src",
      "apps",
      "packages",
      "README.md",
      "Dockerfile",
    ].some((entry) => entries.has(entry));
  } catch {
    return false;
  }
}

function deriveRepoNameFromRepoUrl(repoUrl: string | null): string | null {
  const trimmed = repoUrl?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const cleanedPath = parsed.pathname.replace(/\/+$/, "");
    const repoName = cleanedPath.split("/").filter(Boolean).pop()?.replace(/\.git$/i, "") ?? "";
    return repoName || null;
  } catch {
    return null;
  }
}

function resolveManagedProjectWorkspaceDir(input: {
  companyId: string;
  projectId: string;
  repoUrl: string | null;
}) {
  const repoName = deriveRepoNameFromRepoUrl(input.repoUrl) ?? "_default";
  return resolveManagedProjectWorkspaceDirFromHomePaths({
    companyId: input.companyId,
    projectId: input.projectId,
    repoName,
  });
}

export async function collectProjectDiagnostics(db: Db, projectId: string): Promise<ProjectDiagnostics | null> {
  const project = await db
    .select({
      id: projects.id,
      companyId: projects.companyId,
      name: projects.name,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .then((rows) => rows[0] ?? null);
  if (!project) return null;

  const workspaceRows = await db
    .select({
      id: projectWorkspaces.id,
      name: projectWorkspaces.name,
      isPrimary: projectWorkspaces.isPrimary,
      sourceType: projectWorkspaces.sourceType,
      cwd: projectWorkspaces.cwd,
      repoUrl: projectWorkspaces.repoUrl,
    })
    .from(projectWorkspaces)
    .where(and(eq(projectWorkspaces.companyId, project.companyId), eq(projectWorkspaces.projectId, project.id)))
    .orderBy(desc(projectWorkspaces.isPrimary), asc(projectWorkspaces.createdAt), asc(projectWorkspaces.id));

  const workspaceDiagnostics = await Promise.all(
    workspaceRows.map(async (workspace) => {
      const cwd = readNonEmptyString(workspace.cwd);
      const cwdExists = cwd ? await directoryExists(cwd) : false;
      const rootEntryCount = cwd && cwdExists ? await countDirectoryEntries(cwd) : null;
      return {
        id: workspace.id,
        name: workspace.name,
        isPrimary: workspace.isPrimary,
        sourceType: workspace.sourceType,
        cwd,
        cwdExists,
        rootEntryCount,
        repoUrl: readNonEmptyString(workspace.repoUrl),
      };
    }),
  );

  const primaryWorkspace = workspaceDiagnostics.find((workspace) => workspace.isPrimary) ?? workspaceDiagnostics[0] ?? null;
  const managedFolder = resolveManagedProjectWorkspaceDir({
    companyId: project.companyId,
    projectId: project.id,
    repoUrl: primaryWorkspace?.repoUrl ?? null,
  });
  const managedFolderExists = await directoryExists(managedFolder);
  const managedFolderEntryCount = managedFolderExists ? await countDirectoryEntries(managedFolder) : null;
  const workspaceCodebaseReady = await Promise.all(
    workspaceDiagnostics.map(async (workspace) => {
      if (!workspace.cwd || !workspace.cwdExists) return false;
      return rootLooksLikeCodebase(workspace.cwd);
    }),
  ).then((values) => values.some(Boolean));
  const managedCodebaseReady = managedFolderExists ? await rootLooksLikeCodebase(managedFolder) : false;

  const warnings: string[] = [];
  if (workspaceDiagnostics.length === 0) {
    warnings.push("Project has no attached workspaces.");
  }
  if (!primaryWorkspace) {
    warnings.push("Project has no primary workspace.");
  }
  if (primaryWorkspace && (!primaryWorkspace.cwd || !primaryWorkspace.cwdExists)) {
    warnings.push("Primary workspace cwd is missing or unavailable.");
  }
  if (!workspaceCodebaseReady && !managedCodebaseReady) {
    warnings.push("No attached workspace currently looks like a codebase checkout.");
  }

  return {
    projectId: project.id,
    companyId: project.companyId,
    projectName: project.name,
    hasPrimaryWorkspace: Boolean(primaryWorkspace),
    workspaceCount: workspaceDiagnostics.length,
    workspaces: workspaceDiagnostics,
    managedFolder,
    managedFolderExists,
    managedFolderEntryCount,
    codebaseReady: workspaceCodebaseReady || managedCodebaseReady,
    warnings,
  };
}

export async function runHeartbeatPreflight(input: {
  db: Db;
  agent: AgentRowLike;
  context: Record<string, unknown>;
  resolvedWorkspaceCwd: string;
  resolvedWorkspaceSource: "project_primary" | "task_session" | "agent_home";
}) : Promise<RunPreflightReport> {
  const checks: RunPreflightCheck[] = [];
  const adapterConfig = asRecord(input.agent.adapterConfig);
  const instructions = await agentInstructionsService().getBundle(input.agent);
  const requiredBundleFiles = ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"];
  const bundleFiles = new Set(instructions.files.map((file) => file.path));

  const cwdExists = await directoryExists(input.resolvedWorkspaceCwd);
  if (!cwdExists) {
    checks.push({
      code: "workspace.cwd_missing",
      severity: "error",
      message: `Resolved workspace cwd does not exist: ${input.resolvedWorkspaceCwd}`,
      details: {
        cwd: input.resolvedWorkspaceCwd,
        source: input.resolvedWorkspaceSource,
      },
    });
  } else {
    const entryCount = await countDirectoryEntries(input.resolvedWorkspaceCwd);
    checks.push({
      code: "workspace.cwd_ready",
      severity: "info",
      message: `Resolved workspace cwd exists (${entryCount ?? 0} entries).`,
      details: {
        cwd: input.resolvedWorkspaceCwd,
        source: input.resolvedWorkspaceSource,
        entryCount,
      },
    });
  }

  for (const fileName of requiredBundleFiles) {
    if (!bundleFiles.has(fileName)) {
      checks.push({
        code: `instructions.missing_${fileName.toLowerCase().replace(/\W+/g, "_")}`,
        severity: fileName === "AGENTS.md" || fileName === "HEARTBEAT.md" ? "error" : "warn",
        message: `Required instructions file is missing from bundle: ${fileName}`,
        details: {
          bundleRoot: instructions.rootPath,
          resolvedEntryPath: instructions.resolvedEntryPath,
        },
      });
    }
  }

  if (instructions.mode === "managed" && !instructions.rootPath) {
    checks.push({
      code: "instructions.root_missing",
      severity: "error",
      message: "Managed instructions bundle has no resolved root path.",
      details: {
        resolvedEntryPath: instructions.resolvedEntryPath,
      },
    });
  }

  const issueId = readNonEmptyString(input.context.issueId);
  const projectId = readNonEmptyString(input.context.projectId);
  const issueProjectId = issueId
    ? await input.db
        .select({ projectId: issues.projectId })
        .from(issues)
        .where(and(eq(issues.id, issueId), eq(issues.companyId, input.agent.companyId)))
        .then((rows) => rows[0]?.projectId ?? null)
    : null;
  const effectiveProjectId = issueProjectId ?? projectId;

  if (effectiveProjectId) {
    const diagnostics = await collectProjectDiagnostics(input.db, effectiveProjectId);
    if (!diagnostics) {
      checks.push({
        code: "project.missing",
        severity: "error",
        message: `Referenced project ${effectiveProjectId} no longer exists.`,
      });
    } else {
      if (!diagnostics.hasPrimaryWorkspace) {
        checks.push({
          code: "project.primary_workspace_missing",
          severity: "error",
          message: "Project has no primary workspace configured.",
          details: { projectId: diagnostics.projectId },
        });
      }
      if (!diagnostics.codebaseReady) {
        checks.push({
          code: "project.codebase_missing",
          severity: "error",
          message: "Project has no attached workspace that currently looks like a codebase checkout.",
          details: {
            projectId: diagnostics.projectId,
            workspaceCount: diagnostics.workspaceCount,
            managedFolder: diagnostics.managedFolder,
          },
        });
      }
    }
  }

  if (input.resolvedWorkspaceSource === "agent_home") {
    const agentHome = resolveDefaultAgentWorkspaceDir(input.agent.id);
    if (path.resolve(input.resolvedWorkspaceCwd) === path.resolve(agentHome) && effectiveProjectId) {
      checks.push({
        code: "workspace.project_fallback_agent_home",
        severity: "error",
        message: "Project-bound run resolved to agent_home fallback instead of a project workspace.",
        details: {
          projectId: effectiveProjectId,
          cwd: input.resolvedWorkspaceCwd,
        },
      });
    }
  }

  if (adapterConfig.instructionsFilePath && !instructions.resolvedEntryPath) {
    checks.push({
      code: "instructions.entry_unresolved",
      severity: "error",
      message: "Adapter config points to an instructions file path that could not be resolved.",
      details: {
        instructionsFilePath: adapterConfig.instructionsFilePath,
      },
    });
  }

  return {
    ok: !checks.some((check) => check.severity === "error"),
    checks,
  };
}
