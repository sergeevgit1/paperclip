import fs from "node:fs/promises";

const DEFAULT_AGENT_BUNDLE_FILES = {
  default: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md", "ROLE.md"],
  ceo: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
} as const;

type DefaultAgentBundleRole = keyof typeof DEFAULT_AGENT_BUNDLE_FILES;

type DefaultAgentInstructionsContext = {
  name?: string;
  role?: string;
  title?: string | null;
  capabilities?: string | null;
};

function resolveDefaultAgentBundleUrl(role: DefaultAgentBundleRole, fileName: string) {
  return new URL(`../onboarding-assets/${role}/${fileName}`, import.meta.url);
}

function withFallback(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function renderTemplate(content: string, context: DefaultAgentInstructionsContext): string {
  const replacements: Record<string, string> = {
    AGENT_NAME: withFallback(context.name, "Agent"),
    AGENT_ROLE: withFallback(context.role, "general"),
    AGENT_TITLE: withFallback(context.title, "Individual Contributor"),
    AGENT_CAPABILITIES: withFallback(
      context.capabilities,
      "Take ownership of assigned work, communicate status clearly, and escalate blockers quickly.",
    ),
  };

  let rendered = content;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${token}}}`, value);
  }
  return rendered;
}

export async function loadDefaultAgentInstructionsBundle(
  role: DefaultAgentBundleRole,
  context: DefaultAgentInstructionsContext = {},
): Promise<Record<string, string>> {
  const fileNames = DEFAULT_AGENT_BUNDLE_FILES[role];
  const entries = await Promise.all(
    fileNames.map(async (fileName) => {
      const content = await fs.readFile(resolveDefaultAgentBundleUrl(role, fileName), "utf8");
      return [fileName, renderTemplate(content, context)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export function resolveDefaultAgentInstructionsBundleRole(role: string): DefaultAgentBundleRole {
  return role === "ceo" ? "ceo" : "default";
}
