import { afterEach, describe, expect, it } from "vitest";
import { buildPaperclipEnv } from "./server-utils.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("buildPaperclipEnv", () => {
  it("forwards ambient GitHub tokens into agent runtime env", () => {
    process.env.GH_TOKEN = "ghs_example_token";
    process.env.GITHUB_TOKEN = "github_example_token";

    const env = buildPaperclipEnv({ id: "agent-1", companyId: "company-1" });

    expect(env.GH_TOKEN).toBe("ghs_example_token");
    expect(env.GITHUB_TOKEN).toBe("github_example_token");
  });

  it("omits blank GitHub tokens", () => {
    process.env.GH_TOKEN = "   ";
    process.env.GITHUB_TOKEN = "";

    const env = buildPaperclipEnv({ id: "agent-1", companyId: "company-1" });

    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });
});
