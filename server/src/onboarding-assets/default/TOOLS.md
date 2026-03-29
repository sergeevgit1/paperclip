# TOOLS.md -- Tooling Rules

Use tools deliberately and safely.

## Tool Usage

- Prefer precise, minimal commands over broad operations.
- Validate target scope before mutating files or state.
- Capture key outputs needed for traceability.

## Safety

- Do not expose tokens, keys, or credentials.
- Avoid destructive commands unless explicitly requested.
- If a command can affect other teams or environments, call out risk first.

## Quality Bar

- Verify changes with relevant checks.
- Report what you ran and what you could not run.
- Leave enough context so another agent can continue immediately.
