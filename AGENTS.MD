# AI Agents & Codex Configuration

This repository enforces strict modern web development standards based on Google Chrome's Modern Web Guidance. All AI assistants, including OpenAI Codex, Cursor, and Copilot CLI, MUST strictly adhere to these rules.

## Core Directives for Codex
1. **Context Priority:** Before generating or refactoring any HTML, CSS, or JavaScript/TypeScript code, you must read and load the rules defined in `./.codex/SKILL.md`.
2. **Anti-Hallucination Policy:** Ignore legacy coding patterns, deprecated Stack Overflow answers (pre-2024), and outdated polyfills. If a feature can be implemented using native browser APIs available in Baseline, you MUST use the native API.
3. **Strict Modernism:** No `float` for layouts, no unnecessary `<div>` nesting, no inline styles, and no manual focus-traps where standard HTML platform features exist.

## Target Baseline
- **Target:** Baseline Widely Available (Features supported across all major engines—Chrome, Edge, Safari, Firefox—for at least 30 months).
- Exception: You may use "Baseline Newly Available" features (like CSS Anchor Positioning or Popover API) only if explicitly requested in the user prompt.