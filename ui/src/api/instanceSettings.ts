import type {
  InstanceExperimentalSettings,
  InstanceGeneralSettings,
  PatchInstanceGeneralSettings,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { api } from "./client";

export interface ManagedOpenCodeStatus {
  installed: boolean;
  command: string;
  prefix: string;
  version: string | null;
}

export const instanceSettingsApi = {
  getGeneral: () =>
    api.get<InstanceGeneralSettings>("/instance/settings/general"),
  updateGeneral: (patch: PatchInstanceGeneralSettings) =>
    api.patch<InstanceGeneralSettings>("/instance/settings/general", patch),
  getExperimental: () =>
    api.get<InstanceExperimentalSettings>("/instance/settings/experimental"),
  updateExperimental: (patch: PatchInstanceExperimentalSettings) =>
    api.patch<InstanceExperimentalSettings>("/instance/settings/experimental", patch),
  getOpenCodeRuntimeStatus: () =>
    api.get<ManagedOpenCodeStatus>("/instance/runtime/opencode"),
  installOpenCodeRuntime: () =>
    api.post<ManagedOpenCodeStatus>("/instance/runtime/opencode/install", {}),
};
