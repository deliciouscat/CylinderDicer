# Agent Instructions

This repository contains a Defold game project in `play/` and a web integration in `web/`.

## Defold Work

- Treat `play/` as the Defold project root; it contains `game.project`.
- For Defold-specific tasks, follow `play/AGENTS.md`.
- Project-local Defold skills are installed in `play/.agents/skills/`.
- Run Defold skill commands from `play/` unless a task explicitly says otherwise.
- Use `play/.deps/` only as read-only dependency context. Never edit files inside it.

## HTML5 Bundle and Web Bridge

- The Defold HTML5 bundle runtime must match Defold editor/desktop build behavior. Platform differences belong only in the `play/main/game_bridge.lua` transport layer.
- Bundle/sync pipeline: `npm run defold:web:bundle` (bob.jar) or Defold editor bundle to `play/wasm-web/`, then `npm run defold:web:sync` to `web/public/play/` (`npm run defold:web:build` does both). Bundle outputs are gitignored generated artifacts.
- Defold Lua changes are NOT picked up by an existing bundle; rebundle + sync before browser verification. Vue wrapper changes only need a Vite refresh.
- Project-local skills for this: `.agents/skills/defold-html5-bundle/` and `.agents/skills/defold-web-bridge/` (mirrored in `.claude/skills/`). Read them before touching the bundle pipeline or `gameBridge.ts` / `DefoldCanvas.vue` / `game_bridge.lua` / `shared/protocol/game-bridge.ts`.

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
