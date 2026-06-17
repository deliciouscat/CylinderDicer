# Agent Instructions

This folder is the **Defold** project root for CylinderDicer. It contains `game.project`.

## Project Map

- **Root config**: `game.project`
- **Bootstrap collection**: `main/main.collection`
- **Main bridge and entrypoint**: `main/`
- **Game flow and domain logic**: `game/`
- **Reusable game modules**: `game/core/`
- **Networking adapter**: `game/net/`
- **GUI screens and HUD pieces**: `ui/`
- **Shared GUI components**: `ui/common/`
- **Input bindings**: `input/`
- **Images, atlases, locale files**: `assets/`
- **Read-only dependency context**: `.deps/`

Key Defold settings from `game.project`:

- **Bootstrap collection**: `/main/main.collectionc`
- **Input binding**: `/input/game.input_bindingc`
- **Display**: `1280x720`, high DPI enabled
- **HTML5 scale mode**: `fit`

Resource paths in `game.project` use Defold resource identifiers. A trailing `c` suffix denotes compiled resources and is expected.

## Installed Defold Skills

Project-local skills are in `.agents/skills/`. Use them before editing matching Defold surfaces:

- `defold-project-setup`: download dependencies and builtins into `.deps/`.
- `defold-project-build`: build through the running Defold editor HTTP API.
- `defold-api-fetch`: fetch current Defold API docs.
- `defold-docs-fetch`: fetch manuals and conceptual docs.
- `defold-examples-fetch`: fetch official examples.
- `defold-assets-search`: search the Defold Asset Store before writing custom reusable modules.
- `defold-proto-file-editing`: create or edit Defold protobuf text assets such as `.gui`, `.collection`, `.atlas`, `.go`, `.sprite`, and `.collisionobject`.
- `defold-scripts-editing`: edit `.lua`, `.script`, `.gui_script`, `.render_script`, and `.editor_script`.
- `defold-shaders-editing`: edit `.vp`, `.fp`, and `.glsl` shader files.
- `defold-native-extension-editing`: work on native extensions.
- `defold-skill-maintain`: update these skill definitions.
- `monarch-screen-setup`: scaffold Monarch screens and popups when Monarch is present.
- `xmath-usage`: use Xmath patterns when the Xmath dependency is present.

## Include Directories

- Use `.deps/` as read-only context for resolving dependency modules, builtins, and APIs.
- Never modify files inside `.deps/`; rerun `defold-project-setup` when dependencies change.

## Defold File Formats

- **Lua scripts**: `.lua`, `.script`, `.gui_script`, `.render_script`, `.editor_script`
- **Metadata assets**: `.collection`, `.go`, `.sprite`, `.tilemap`, `.tilesource`, `.atlas`, `.font`, `.particlefx`, `.sound`, `.label`, `.gui`, `.model`, `.mesh`, `.material`, `.collisionobject`, `.texture_profiles`, `.display_profiles`
- **Manifests**: `.appmanifest`, `.manifest`
- **Buffers**: `.buffer`
- **Shaders**: `.vp`, `.fp`, `.glsl`
- **Project config**: `game.project`
- **Properties**: `game.properties`, `ext.properties`

Use `defold-proto-file-editing` before creating or editing Defold metadata assets. Use `defold-scripts-editing` before modifying scripts. Use official docs skills when touching APIs you are not certain about.

## Lua Style

- Indentation: one tab.
- Naming: `snake_case` for variables, functions, files, and folders.
- Use LuaCATS annotations for public modules and important data shapes.
- Keep empty lines truly empty and avoid trailing whitespace.
- Do not invent undocumented Defold APIs. Verify with `defold-api-fetch` or `defold-docs-fetch`.
- Store script instance state on `self`, not module-level locals.
- Keep local helper functions at module scope, not nested inside other functions.
- Use `require("module.path")` with parentheses and dot notation. Do not use leading slashes in `require`.
- GUI scripts should communicate with game logic through messages instead of directly importing gameplay modules.
- Inline `hash("message")` is fine. Promote reused hashes to module-level `UPPER_CASE` constants.

## Validation

- Prefer building through the running editor with `defold-project-build`.
- If the editor is not running, report that build validation was unavailable instead of guessing.
