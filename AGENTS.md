# Agent Instructions

This repository contains a Defold game project in `play/` and a web integration in `web/`.

## Defold Work

- Treat `play/` as the Defold project root; it contains `game.project`.
- For Defold-specific tasks, follow `play/AGENTS.md`.
- Project-local Defold skills are installed in `play/.agents/skills/`.
- Run Defold skill commands from `play/` unless a task explicitly says otherwise.
- Use `play/.deps/` only as read-only dependency context. Never edit files inside it.

## Repository Notes

- Existing generated assets and game files may be user work in progress. Do not revert unrelated changes.
- Keep Defold resource paths absolute where the engine expects them, for example `/main/main.collectionc`.
- Keep Lua code in the existing project style: tabs for indentation, `snake_case`, message-driven UI boundaries, and module `require("path.to.module")` calls.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
