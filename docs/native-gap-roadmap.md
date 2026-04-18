# Claude Desktop CN Native Gap Roadmap

This roadmap tracks the highest-value work needed to align this app with the native Claude app and Claude Code experience, while keeping the current self-hosted strengths.

## Product Position

Today this project is strongest as a self-hosted Claude-style desktop client with:

- chat
- projects
- artifacts
- research panel
- GitHub import
- provider/model management

The biggest remaining gap is not visual polish. It is workflow completeness.

## Phase 1: Claude App Parity

### P0

1. Real project knowledge workflows
   - project-level GitHub linking and sync
   - clear project file provenance
   - stronger project instructions editing
   - prepare for large-project retrieval workflows

2. Integrations foundation
   - keep GitHub first-class
   - add connector architecture that can support Google Drive, Gmail, and Calendar

3. Styles system
   - preset styles
   - custom styles
   - per-chat style selection

### P1

4. Research workflow polish
   - research mode entry point
   - better source summaries
   - clearer progress states

5. Artifact workflow polish
   - stronger create/edit/remix loop
   - better artifact organization

## Phase 2: Claude Code Parity

### P0

1. Turn the Code tab into a real mode
   - workspace picker
   - workspace status
   - recent workspaces
   - code-oriented conversation defaults

2. Expose project memory
   - workspace memory entrypoint
   - project rules surface
   - CLAUDE.md style guidance in UI

3. Expose tooling controls
   - permissions state
   - tool visibility
   - MCP server management

### P1

4. IDE and repo workflows
   - open current workspace in editor
   - repo review flow
   - diff awareness
   - PR-oriented GitHub actions

5. Hooks and automation
   - project hooks UI
   - pre/post action automation

## Current Implementation Batch

This batch starts with the highest-leverage project workflow gap:

- add project-level GitHub import and sync
- persist linked GitHub sources on each project
- update project workspaces to preserve nested imported paths
- point publish metadata at the user-owned GitHub repository

## Next Recommended Batch

After this batch lands, the next implementation target should be:

1. project-level file configuration UI for linked repos
2. style presets and custom styles
3. dedicated Code mode workspace panel
