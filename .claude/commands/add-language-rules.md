---
name: add-language-rules
description: Add or extend a ruleset under .claude/rules for a new language, runtime, or area of the codebase
allowed-tools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob']
---

# /add-language-rules

Use this workflow when introducing a ruleset for a part of the codebase that
`.claude/rules/` does not yet cover.

## Goal

Add a focused rules file describing how one language, runtime, or subsystem is
actually used in this repository — grounded in the real files, not in generic
best practice.

## Existing Rulesets

- `.claude/rules/aluxplaza-guardrails.md` — repository-wide invariants
- `.claude/rules/backend-node.md` — `backend/`, Node + Express, ESM
- `.claude/rules/frontend-react.md` — `frontend/`, React + TypeScript

## When This Applies

- A new language or runtime appears in the repo. `tools/` already holds
  standalone Python scripts alongside the Node tooling, so a `tools-python.md`
  ruleset would be a legitimate next step.
- An existing ruleset has drifted from the code and needs correcting.
- A subsystem is large enough to deserve its own file (for example
  `docs/` methodology writing conventions, or the `pg-boss` job layer).

## Common Files

- `.claude/rules/*.md` — the rulesets themselves
- `CLAUDE.md` — the entry point that points at them
- `<area>/package.json`, `<area>/eslint.config.*`, `<area>/README.md` — the
  ground truth for stack, scripts, and conventions

## Suggested Sequence

1. **Read the real code before writing a word.** The config files, the lint
   config, the CI workflow, and a handful of representative modules. Every
   existing ruleset in this repo cites specific files and commands for this
   reason — a ruleset that contradicts the code is worse than none.
2. Note the exact commands a change must pass: lint, test, build, format. Copy
   them from `package.json` scripts, not from memory.
3. Note the conventions that are genuinely _local_ — the kebab-case filenames,
   the `_` unused-arg convention, the two-separate-ESLint-installs situation.
   These are the things a generic rule set would get wrong.
4. Write the new ruleset to `.claude/rules/<area>.md`, and list it in
   `CLAUDE.md`.
5. Keep the prompt-defense baseline block consistent with the other rulesets.

## Typical Commit Signals

- A new `.claude/rules/*.md`
- An update to `CLAUDE.md` to reference it
- A correction to an existing ruleset that had drifted

## Notes

- Prefer one precise ruleset over several vague ones. Scope it by directory,
  not by concept.
- If a rule cannot be checked against a command or a file in this repository,
  it is probably opinion rather than convention. Cut it.
- Do not restate `aluxplaza-guardrails.md` in full; link to it.
