# E2E Testing Guidelines

See `@docs/guidance/playwright.md` for Playwright best practices (auto-loaded for `*.spec.ts`).

## Directory Structure

```text
browser_tests/
├── assets/           - Test data (JSON workflows, images)
├── fixtures/
│   ├── ComfyPage.ts      - Main fixture (delegates to helpers)
│   ├── ComfyMouse.ts     - Mouse interaction helper
│   ├── VueNodeHelpers.ts - Vue Nodes 2.0 helpers
│   ├── selectors.ts      - Centralized TestIds
│   ├── data/             - Static test data (mock API responses, workflow JSONs, node definitions)
│   ├── components/       - Page object components (locators, user interactions)
│   │   ├── ContextMenu.ts
│   │   ├── SettingDialog.ts
│   │   ├── SidebarTab.ts
│   │   └── Topbar.ts
│   ├── helpers/          - Focused helper classes (domain-specific actions)
│   │   ├── CanvasHelper.ts
│   │   ├── CommandHelper.ts
│   │   ├── KeyboardHelper.ts
│   │   ├── NodeOperationsHelper.ts
│   │   ├── SettingsHelper.ts
│   │   ├── WorkflowHelper.ts
│   │   └── ...
│   └── utils/            - Pure utility functions (no page dependency)
├── helpers/          - Test-specific utilities
└── tests/            - Test files (*.spec.ts)
```

### Architectural Separation

- **`fixtures/data/`** — Static test data only. Mock API responses, workflow JSONs, node definitions. No code, no imports from Playwright.
- **`fixtures/components/`** — Page object components. Encapsulate locators and user interactions for a specific UI area.
- **`fixtures/helpers/`** — Focused helper classes. Domain-specific actions that coordinate multiple page objects (e.g. canvas operations, workflow loading).
- **`fixtures/utils/`** — Pure utility functions. No `Page` dependency; stateless helpers that can be used anywhere.

## After Making Changes

- Run `pnpm typecheck:browser` after modifying TypeScript files in this directory
- Run `pnpm exec eslint browser_tests/path/to/file.ts` to lint specific files
- Run `pnpm exec oxlint browser_tests/path/to/file.ts` to check with oxlint

## Skill Documentation

A Playwright test-writing skill exists at `.claude/skills/writing-playwright-tests/SKILL.md`.

The skill documents **meta-level guidance only** (gotchas, anti-patterns, decision guides). It does **not** duplicate fixture APIs - agents should read the fixture code directly in `browser_tests/fixtures/`.
