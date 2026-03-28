import { registerOpenCodeCustomProvider } from "../packages/adapters/opencode-local/src/server/provider-config.js";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw?.startsWith("--")) continue;
    const key = raw.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, value);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const providerId = args.get("id") ?? "";
  const baseURL = args.get("base-url") ?? "";
  const apiKey = args.get("api-key") ?? "";
  const providerName = args.get("name") ?? undefined;
  const headersJson = args.get("headers") ?? "{}";

  if (!providerId || !baseURL || !apiKey) {
    throw new Error(
      "Usage: pnpm tsx scripts/register-opencode-provider.ts --id myprovider --base-url https://api.example.com/v1 --api-key sk-... [--name 'My Provider'] [--headers '{\"X-Test\":\"1\"}']",
    );
  }

  let headers: Record<string, string> = {};
  if (headersJson.trim()) {
    const parsed = JSON.parse(headersJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("--headers must be a JSON object");
    }
    headers = Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }

  const result = await registerOpenCodeCustomProvider({
    providerId,
    providerName,
    baseURL,
    apiKey,
    headers,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
