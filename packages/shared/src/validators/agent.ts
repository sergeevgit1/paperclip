import { z } from "zod";
import {
  AGENT_ADAPTER_TYPES,
  AGENT_ICON_NAMES,
  AGENT_ROLES,
  AGENT_STATUSES,
} from "../constants.js";
import { envConfigSchema } from "./secret.js";

export const agentPermissionsSchema = z.object({
  canCreateAgents: z.boolean().optional().default(false),
});

export const agentInstructionsBundleModeSchema = z.enum(["managed", "external"]);

export const updateAgentInstructionsBundleSchema = z.object({
  mode: agentInstructionsBundleModeSchema.optional(),
  rootPath: z.string().trim().min(1).nullable().optional(),
  entryFile: z.string().trim().min(1).optional(),
  clearLegacyPromptTemplate: z.boolean().optional().default(false),
});

export type UpdateAgentInstructionsBundle = z.infer<typeof updateAgentInstructionsBundleSchema>;

export const upsertAgentInstructionsFileSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
  clearLegacyPromptTemplate: z.boolean().optional().default(false),
});

export type UpsertAgentInstructionsFile = z.infer<typeof upsertAgentInstructionsFileSchema>;

const adapterConfigSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  const envValue = value.env;
  if (envValue === undefined) return;
  const parsed = envConfigSchema.safeParse(envValue);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "adapterConfig.env must be a map of valid env bindings",
      path: ["env"],
    });
  }
});

const baseCreateAgentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(AGENT_ROLES).optional().default("general"),
  title: z.string().optional().nullable(),
  icon: z.enum(AGENT_ICON_NAMES).optional().nullable(),
  reportsTo: z.string().uuid().optional().nullable(),
  capabilities: z.string().optional().nullable(),
  desiredSkills: z.array(z.string().min(1)).optional(),
  adapterType: z.enum(AGENT_ADAPTER_TYPES).optional().default("process"),
  adapterConfig: adapterConfigSchema.optional().default({}),
  runtimeConfig: z.record(z.unknown()).optional().default({}),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  permissions: agentPermissionsSchema.optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

function validateAgentReportingLine(
  value: z.infer<typeof baseCreateAgentSchema>,
  ctx: z.RefinementCtx,
) {
  if (value.role !== "ceo" && !value.reportsTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Non-CEO agents must report to a manager or CEO",
      path: ["reportsTo"],
    });
  }
}

export const createAgentSchema = baseCreateAgentSchema.superRefine(validateAgentReportingLine);

export type CreateAgent = z.infer<typeof createAgentSchema>;

export const createAgentHireSchema = baseCreateAgentSchema
  .extend({
    sourceIssueId: z.string().uuid().optional().nullable(),
    sourceIssueIds: z.array(z.string().uuid()).optional(),
  })
  .superRefine(validateAgentReportingLine);

export type CreateAgentHire = z.infer<typeof createAgentHireSchema>;

export const updateAgentSchema = baseCreateAgentSchema
  .omit({ permissions: true })
  .partial()
  .extend({
    permissions: z.never().optional(),
    replaceAdapterConfig: z.boolean().optional(),
    status: z.enum(AGENT_STATUSES).optional(),
    spentMonthlyCents: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role !== undefined && value.role !== "ceo" && value.reportsTo === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-CEO agents must report to a manager or CEO",
        path: ["reportsTo"],
      });
    }
  });

export type UpdateAgent = z.infer<typeof updateAgentSchema>;

export const updateAgentInstructionsPathSchema = z.object({
  path: z.string().trim().min(1).nullable(),
  adapterConfigKey: z.string().trim().min(1).optional(),
});

export type UpdateAgentInstructionsPath = z.infer<typeof updateAgentInstructionsPathSchema>;

export const createAgentKeySchema = z.object({
  name: z.string().min(1).default("default"),
});

export type CreateAgentKey = z.infer<typeof createAgentKeySchema>;

export const wakeAgentSchema = z.object({
  source: z.enum(["timer", "assignment", "on_demand", "automation"]).optional().default("on_demand"),
  triggerDetail: z.enum(["manual", "ping", "callback", "system"]).optional(),
  reason: z.string().optional().nullable(),
  payload: z.record(z.unknown()).optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
  forceFreshSession: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.boolean().optional().default(false),
  ),
});

export type WakeAgent = z.infer<typeof wakeAgentSchema>;

export const resetAgentSessionSchema = z.object({
  taskKey: z.string().min(1).optional().nullable(),
});

export type ResetAgentSession = z.infer<typeof resetAgentSessionSchema>;

export const testAdapterEnvironmentSchema = z.object({
  adapterConfig: adapterConfigSchema.optional().default({}),
});

export type TestAdapterEnvironment = z.infer<typeof testAdapterEnvironmentSchema>;

export const registerOpenCodeProviderSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().optional(),
  baseURL: z.string().url(),
  apiKey: z.string().min(1),
  headers: z.record(z.string()).optional().default({}),
});

export type RegisterOpenCodeProvider = z.infer<typeof registerOpenCodeProviderSchema>;

export const updateAgentPermissionsSchema = z.object({
  canCreateAgents: z.boolean(),
  canAssignTasks: z.boolean(),
});

export type UpdateAgentPermissions = z.infer<typeof updateAgentPermissionsSchema>;
