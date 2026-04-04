import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, instanceSettings, issues, projects } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { runHeartbeatPreflight } from "../services/run-preflight.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres run preflight tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("runHeartbeatPreflight", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-run-preflight-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(instanceSettings);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("does not require project codebase checks for agent_home runs when the issue has no project workspace binding", async () => {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issueId = randomUUID();
    const projectId = randomUUID();
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-preflight-agent-home-"));

    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Operator",
      role: "operator",
      status: "active",
      adapterType: "opencode_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });

    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Onboarding",
      status: "in_progress",
    });

    await db.insert(issues).values({
      id: issueId,
      companyId,
      projectId,
      projectWorkspaceId: null,
      title: "Operational issue",
      status: "todo",
      priority: "medium",
    });

    await fs.writeFile(path.join(workspaceDir, "AGENTS.md"), "agent instructions\n", "utf8");
    await fs.writeFile(path.join(workspaceDir, "HEARTBEAT.md"), "heartbeat instructions\n", "utf8");
    await fs.writeFile(path.join(workspaceDir, "SOUL.md"), "soul instructions\n", "utf8");
    await fs.writeFile(path.join(workspaceDir, "TOOLS.md"), "tools instructions\n", "utf8");

    const report = await runHeartbeatPreflight({
      db,
      agent: {
        id: agentId,
        companyId,
        name: "Operator",
        adapterConfig: {
          instructionsBundleMode: "managed",
          instructionsRootPath: workspaceDir,
          instructionsFilePath: path.join(workspaceDir, "AGENTS.md"),
          instructionsEntryFile: "AGENTS.md",
        },
      },
      context: {
        issueId,
        projectId,
      },
      resolvedWorkspaceCwd: workspaceDir,
      resolvedWorkspaceSource: "agent_home",
    });

    expect(report.ok).toBe(true);
    expect(report.checks.some((check) => check.code === "project.primary_workspace_missing")).toBe(false);
    expect(report.checks.some((check) => check.code === "project.codebase_missing")).toBe(false);

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});
