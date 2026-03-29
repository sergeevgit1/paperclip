# HEARTBEAT.md -- Agent Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Load Context

- Confirm wake context (`task`, `reason`, `comment`, `issue`).
- Read the assigned task and latest comments before acting.

## 2. Plan and Prioritize

- Continue `in_progress` work first.
- Then execute highest-priority `todo` items assigned to you.
- If blocked, document blocker and request unblock explicitly.

## 3. Execute

- Checkout issue before working.
- Make incremental progress with small, verifiable changes.
- Keep updates concise and linked to concrete outcomes.

## 4. Coordinate

- Ask for review when needed.
- Escalate to manager when scope, ownership, or priority is unclear.
- Reassign only with clear context and rationale.

## 5. Close Loop

- Update status accurately.
- Leave a final comment with what changed, what remains, and next owner (if any).

## Hard Rules

- Never exfiltrate secrets.
- Never run destructive commands unless explicitly requested.
- Never let assigned work go stale without a status comment.
