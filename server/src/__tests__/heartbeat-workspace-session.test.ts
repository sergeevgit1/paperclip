import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { agents } from "@paperclipai/db";
import { sessionCodec as codexSessionCodec } from "@paperclipai/adapter-codex-local/server";
import { resolveDefaultAgentWorkspaceDir } from "../home-paths.js";
import {
  archiveStaleExecutionWorkspace,
  buildExplicitResumeSessionOverride,
  deriveTaskKeyWithHeartbeatFallback,
  ensureAgentWorkspaceBootstrapFromInstructions,
  formatRuntimeWorkspaceWarningLog,
  isStaleExecutionWorkspaceReuseCandidate,
  prioritizeProjectWorkspaceCandidatesForRun,
  parseSessionCompactionPolicy,
  resolveRuntimeSessionParamsForWorkspace,
  shouldResetTaskSessionForWake,
  type ResolvedWorkspaceForRun,
} from "../services/heartbeat.ts";

function buildResolvedWorkspace(overrides: Partial<ResolvedWorkspaceForRun> = {}): ResolvedWorkspaceForRun {
  return {
    cwd: "/tmp/project",
    source: "project_primary",
    projectId: "project-1",
    workspaceId: "workspace-1",
    repoUrl: null,
    repoRef: null,
    workspaceHints: [],
    warnings: [],
    ...overrides,
  };
}

function buildAgent(adapterType: string, runtimeConfig: Record<string, unknown> = {}) {
  return {
    id: "agent-1",
    companyId: "company-1",
    projectId: null,
    goalId: null,
    name: "Agent",
    role: "engineer",
    title: null,
    icon: null,
    status: "running",
    reportsTo: null,
    capabilities: null,
    adapterType,
    adapterConfig: {},
    runtimeConfig,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    permissions: {},
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as typeof agents.$inferSelect;
}

describe("resolveRuntimeSessionParamsForWorkspace", () => {
  it("migrates fallback workspace sessions to project workspace when project cwd becomes available", () => {
    const agentId = "agent-123";
    const fallbackCwd = resolveDefaultAgentWorkspaceDir(agentId);

    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId,
      previousSessionParams: {
        sessionId: "session-1",
        cwd: fallbackCwd,
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({ cwd: "/tmp/new-project-cwd" }),
    });

    expect(result.sessionParams).toMatchObject({
      sessionId: "session-1",
      cwd: "/tmp/new-project-cwd",
      workspaceId: "workspace-1",
    });
    expect(result.warning).toContain("Attempting to resume session");
  });

  it("does not migrate when previous session cwd is not the fallback workspace", () => {
    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId: "agent-123",
      previousSessionParams: {
        sessionId: "session-1",
        cwd: "/tmp/some-other-cwd",
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({ cwd: "/tmp/new-project-cwd" }),
    });

    expect(result.sessionParams).toEqual({
      sessionId: "session-1",
      cwd: "/tmp/some-other-cwd",
      workspaceId: "workspace-1",
    });
    expect(result.warning).toBeNull();
  });

  it("does not migrate when resolved workspace id differs from previous session workspace id", () => {
    const agentId = "agent-123";
    const fallbackCwd = resolveDefaultAgentWorkspaceDir(agentId);

    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId,
      previousSessionParams: {
        sessionId: "session-1",
        cwd: fallbackCwd,
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({
        cwd: "/tmp/new-project-cwd",
        workspaceId: "workspace-2",
      }),
    });

    expect(result.sessionParams).toEqual({
      sessionId: "session-1",
      cwd: fallbackCwd,
      workspaceId: "workspace-1",
    });
    expect(result.warning).toBeNull();
  });
});

describe("isStaleExecutionWorkspaceReuseCandidate", () => {
  it("treats runtime-created _default workspaces without project binding as stale once a real project workspace exists", () => {
    expect(
      isStaleExecutionWorkspaceReuseCandidate({
        existingExecutionWorkspace: {
          projectWorkspaceId: null,
          cwd: "/paperclip/instances/default/projects/company/project/_default",
          repoUrl: null,
          metadata: { createdByRuntime: true },
        },
        issueProjectWorkspaceId: "workspace-1",
        resolvedWorkspaceId: "workspace-1",
        resolvedWorkspaceCwd: "/paperclip/instances/default/projects/company/project/gptsystem",
        resolvedWorkspaceRepoUrl: "https://github.com/example/gptsystem.git",
      }),
    ).toBe(true);
  });

  it("does not mark concrete project workspaces as stale", () => {
    expect(
      isStaleExecutionWorkspaceReuseCandidate({
        existingExecutionWorkspace: {
          projectWorkspaceId: "workspace-1",
          cwd: "/paperclip/instances/default/projects/company/project/gptsystem",
          repoUrl: "https://github.com/example/gptsystem.git",
          metadata: { createdByRuntime: true },
        },
        issueProjectWorkspaceId: "workspace-1",
        resolvedWorkspaceId: "workspace-1",
        resolvedWorkspaceCwd: "/paperclip/instances/default/projects/company/project/gptsystem",
        resolvedWorkspaceRepoUrl: "https://github.com/example/gptsystem.git",
      }),
    ).toBe(false);
  });
});

describe("archiveStaleExecutionWorkspace", () => {
  it("archives stale execution workspaces with a cleanup reason", async () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const result = await archiveStaleExecutionWorkspace({
      executionWorkspacesSvc: {
        update: async (id: string, patch: Record<string, unknown>) => {
          updates.push({ id, patch });
          return { id, ...patch };
        },
      } as never,
      staleExecutionWorkspace: {
        id: "exec-1",
        cwd: "/paperclip/instances/default/projects/company/project/_default",
        status: "active",
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.id).toBe("exec-1");
    expect(updates[0]?.patch).toMatchObject({
      status: "archived",
      cleanupReason: "stale_project_workspace_fallback",
    });
    expect(result).toMatchObject({
      id: "exec-1",
      status: "archived",
      cleanupReason: "stale_project_workspace_fallback",
    });
  });

  it("does nothing when workspace is already archived", async () => {
    const result = await archiveStaleExecutionWorkspace({
      executionWorkspacesSvc: {
        update: async () => {
          throw new Error("should not update archived workspace");
        },
      } as never,
      staleExecutionWorkspace: {
        id: "exec-1",
        cwd: "/paperclip/instances/default/projects/company/project/_default",
        status: "archived",
      },
    });

    expect(result).toEqual({
      id: "exec-1",
      cwd: "/paperclip/instances/default/projects/company/project/_default",
      status: "archived",
    });
  });
});

describe("shouldResetTaskSessionForWake", () => {
  it("resets session context on assignment wake", () => {
    expect(shouldResetTaskSessionForWake({ wakeReason: "issue_assigned" })).toBe(true);
  });

  it("preserves session context on timer heartbeats", () => {
    expect(shouldResetTaskSessionForWake({ wakeSource: "timer" })).toBe(false);
  });

  it("preserves session context on manual on-demand invokes by default", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "manual",
      }),
    ).toBe(false);
  });

  it("resets session context when a fresh session is explicitly requested", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "manual",
        forceFreshSession: true,
      }),
    ).toBe(true);
  });

  it("does not reset session context on mention wake comment", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeReason: "issue_comment_mentioned",
        wakeCommentId: "comment-1",
      }),
    ).toBe(false);
  });

  it("does not reset session context when commentId is present", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeReason: "issue_commented",
        commentId: "comment-2",
      }),
    ).toBe(false);
  });

  it("does not reset for comment wakes", () => {
    expect(shouldResetTaskSessionForWake({ wakeReason: "issue_commented" })).toBe(false);
  });

  it("does not reset when wake reason is missing", () => {
    expect(shouldResetTaskSessionForWake({})).toBe(false);
  });

  it("does not reset session context on callback on-demand invokes", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "callback",
      }),
    ).toBe(false);
  });
});

describe("deriveTaskKeyWithHeartbeatFallback", () => {
  it("returns explicit taskKey when present", () => {
    expect(deriveTaskKeyWithHeartbeatFallback({ taskKey: "issue-123" }, null)).toBe("issue-123");
  });

  it("returns explicit issueId when no taskKey", () => {
    expect(deriveTaskKeyWithHeartbeatFallback({ issueId: "issue-456" }, null)).toBe("issue-456");
  });

  it("returns __heartbeat__ for timer wakes with no explicit key", () => {
    expect(deriveTaskKeyWithHeartbeatFallback({ wakeSource: "timer" }, null)).toBe("__heartbeat__");
  });

  it("prefers explicit key over heartbeat fallback even on timer wakes", () => {
    expect(
      deriveTaskKeyWithHeartbeatFallback({ wakeSource: "timer", taskKey: "issue-789" }, null),
    ).toBe("issue-789");
  });

  it("returns null for non-timer wakes with no explicit key", () => {
    expect(deriveTaskKeyWithHeartbeatFallback({ wakeSource: "on_demand" }, null)).toBeNull();
  });

  it("returns null for empty context", () => {
    expect(deriveTaskKeyWithHeartbeatFallback({}, null)).toBeNull();
  });
});

describe("ensureAgentWorkspaceBootstrapFromInstructions", () => {
  it("copies ROLE.md and seeds daily memory notes for agent home and parent workspace", async () => {
    const tmpPaperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-heartbeat-home-"));
    const originalPaperclipHome = process.env.PAPERCLIP_HOME;
    const originalPaperclipInstanceId = process.env.PAPERCLIP_INSTANCE_ID;
    process.env.PAPERCLIP_HOME = tmpPaperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "default";

    const instructionsRoot = path.join(
      tmpPaperclipHome,
      "instances",
      "default",
      "companies",
      "company-1",
      "agents",
      "agent-1",
      "instructions",
    );
    const workspaceDir = path.join(tmpPaperclipHome, "instances", "default", "workspaces", "agent-1");
    await fs.mkdir(instructionsRoot, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(instructionsRoot, "AGENTS.md"), "# agents\n", "utf8"),
      fs.writeFile(path.join(instructionsRoot, "HEARTBEAT.md"), "# heartbeat\n", "utf8"),
      fs.writeFile(path.join(instructionsRoot, "SOUL.md"), "# soul\n", "utf8"),
      fs.writeFile(path.join(instructionsRoot, "TOOLS.md"), "# tools\n", "utf8"),
      fs.writeFile(path.join(instructionsRoot, "ROLE.md"), "# role\n", "utf8"),
    ]);

    await ensureAgentWorkspaceBootstrapFromInstructions({
      companyId: "company-1",
      agentId: "agent-1",
      workspaceDir,
    });

    await expect(fs.readFile(path.join(workspaceDir, "ROLE.md"), "utf8")).resolves.toContain("# role");
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const noteName = `${yyyy}-${mm}-${dd}.md`;
    await expect(fs.readFile(path.join(workspaceDir, "memory", noteName), "utf8")).resolves.toContain(`# ${noteName}`);
    await expect(fs.readFile(path.join(path.dirname(workspaceDir), "memory", noteName), "utf8")).resolves.toContain(`# ${noteName}`);

    if (originalPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = originalPaperclipHome;
    if (originalPaperclipInstanceId === undefined) delete process.env.PAPERCLIP_INSTANCE_ID;
    else process.env.PAPERCLIP_INSTANCE_ID = originalPaperclipInstanceId;
  });
});

describe("buildExplicitResumeSessionOverride", () => {
  it("reuses saved task session params when they belong to the selected failed run", () => {
    const result = buildExplicitResumeSessionOverride({
      resumeFromRunId: "run-1",
      resumeRunSessionIdBefore: "session-before",
      resumeRunSessionIdAfter: "session-after",
      taskSession: {
        sessionParamsJson: {
          sessionId: "session-after",
          cwd: "/tmp/project",
        },
        sessionDisplayId: "session-after",
        lastRunId: "run-1",
      },
      sessionCodec: codexSessionCodec,
    });

    expect(result).toEqual({
      sessionDisplayId: "session-after",
      sessionParams: {
        sessionId: "session-after",
        cwd: "/tmp/project",
      },
    });
  });

  it("falls back to the selected run session id when no matching task session params are available", () => {
    const result = buildExplicitResumeSessionOverride({
      resumeFromRunId: "run-1",
      resumeRunSessionIdBefore: "session-before",
      resumeRunSessionIdAfter: "session-after",
      taskSession: {
        sessionParamsJson: {
          sessionId: "other-session",
          cwd: "/tmp/project",
        },
        sessionDisplayId: "other-session",
        lastRunId: "run-2",
      },
      sessionCodec: codexSessionCodec,
    });

    expect(result).toEqual({
      sessionDisplayId: "session-after",
      sessionParams: {
        sessionId: "session-after",
      },
    });
  });
});

describe("formatRuntimeWorkspaceWarningLog", () => {
  it("emits informational workspace warnings on stdout", () => {
    expect(formatRuntimeWorkspaceWarningLog("Using fallback workspace")).toEqual({
      stream: "stdout",
      chunk: "[paperclip] Using fallback workspace\n",
    });
  });
});

describe("prioritizeProjectWorkspaceCandidatesForRun", () => {
  it("moves the explicitly selected workspace to the front", () => {
    const rows = [
      { id: "workspace-1", cwd: "/tmp/one" },
      { id: "workspace-2", cwd: "/tmp/two" },
      { id: "workspace-3", cwd: "/tmp/three" },
    ];

    expect(
      prioritizeProjectWorkspaceCandidatesForRun(rows, "workspace-2").map((row) => row.id),
    ).toEqual(["workspace-2", "workspace-1", "workspace-3"]);
  });

  it("keeps the original order when no preferred workspace is selected", () => {
    const rows = [
      { id: "workspace-1" },
      { id: "workspace-2" },
    ];

    expect(
      prioritizeProjectWorkspaceCandidatesForRun(rows, null).map((row) => row.id),
    ).toEqual(["workspace-1", "workspace-2"]);
  });

  it("keeps the original order when the selected workspace is missing", () => {
    const rows = [
      { id: "workspace-1" },
      { id: "workspace-2" },
    ];

    expect(
      prioritizeProjectWorkspaceCandidatesForRun(rows, "workspace-9").map((row) => row.id),
    ).toEqual(["workspace-1", "workspace-2"]);
  });
});

describe("parseSessionCompactionPolicy", () => {
  it("disables Paperclip-managed rotation by default for codex and claude local", () => {
    expect(parseSessionCompactionPolicy(buildAgent("codex_local"))).toEqual({
      enabled: true,
      maxSessionRuns: 0,
      maxRawInputTokens: 0,
      maxSessionAgeHours: 0,
    });
    expect(parseSessionCompactionPolicy(buildAgent("claude_local"))).toEqual({
      enabled: true,
      maxSessionRuns: 0,
      maxRawInputTokens: 0,
      maxSessionAgeHours: 0,
    });
  });

  it("keeps conservative defaults for adapters without confirmed native compaction", () => {
    expect(parseSessionCompactionPolicy(buildAgent("cursor"))).toEqual({
      enabled: true,
      maxSessionRuns: 200,
      maxRawInputTokens: 2_000_000,
      maxSessionAgeHours: 72,
    });
    expect(parseSessionCompactionPolicy(buildAgent("opencode_local"))).toEqual({
      enabled: true,
      maxSessionRuns: 200,
      maxRawInputTokens: 2_000_000,
      maxSessionAgeHours: 72,
    });
  });

  it("lets explicit agent overrides win over adapter defaults", () => {
    expect(
      parseSessionCompactionPolicy(
        buildAgent("codex_local", {
          heartbeat: {
            sessionCompaction: {
              maxSessionRuns: 25,
              maxRawInputTokens: 500_000,
            },
          },
        }),
      ),
    ).toEqual({
      enabled: true,
      maxSessionRuns: 25,
      maxRawInputTokens: 500_000,
      maxSessionAgeHours: 0,
    });
  });
});
