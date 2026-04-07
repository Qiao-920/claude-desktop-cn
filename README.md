# Claude Desktop App

**Use any AI model to run Claude Code's agent system — with a claude.ai-like interface.**

One prompt, and the AI reads files, writes code, runs commands, installs dependencies, and delivers a working project. Powered by Claude Code's open-source engine, but works with **any OpenAI-compatible model** — Qwen, DeepSeek, Claude, GPT, Gemini, or your own.

<p align="center">
  <img src="public/favicon.png" alt="Claude Desktop App" width="100" />
</p>

<p align="center">
  <a href="../../releases"><img src="https://img.shields.io/github/v/release/pretend1111/claude-desktop-app?style=flat-square" alt="Release" /></a>
  <a href="../../stargazers"><img src="https://img.shields.io/github/stars/pretend1111/claude-desktop-app?style=flat-square" alt="Stars" /></a>
  <a href="../../releases"><img src="https://img.shields.io/github/downloads/pretend1111/claude-desktop-app/total?style=flat-square" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Non--Commercial-blue?style=flat-square" alt="License" /></a>
</p>

## Why?

Claude Code is powerful but expensive, and locked to Anthropic's models. Other AI coding tools are IDE-based and complex.

This project gives you:
- **Claude Code's full agent system** (19+ tools, file ops, shell, web search, multi-turn reasoning) — in a clean chat interface
- **Any model you want** — plug in a free Qwen API key and get the same agent capabilities
- **claude.ai's frontend experience** — dark mode, streaming, thinking blocks, tool cards, skills, projects

## Demo

> "Write a 3D racing game"

The AI creates files, installs Three.js, writes game logic, starts a server — all autonomously, streaming each step in real time.

## Features

### Multi-Model Agent
Connect **any** OpenAI-compatible provider. The built-in proxy transparently converts between Anthropic and OpenAI formats, including:
- Tool calling (function calling)
- Extended thinking / reasoning (Qwen `enable_thinking`, DeepSeek reasoning)
- Vision / image understanding
- Streaming with real-time progress

### Agent Capabilities
The Claude Code engine provides 19+ tools:
- **Read / Write / Edit** — Create and modify files
- **Bash** — Run shell commands
- **Glob / Grep** — Search codebases
- **WebSearch / WebFetch** — Search the web and fetch pages
- **Agent** — Spawn sub-agents for parallel tasks
- **Skills** — Invoke reusable instruction sets

### Skills System
- Browse and select skills from the input menu
- `/skill-name` rendered as blue tag in chat
- Model reads skill instructions via the Skill tool (visible in UI)
- Create custom skills with the built-in **skill-creator**
- Skills saved to `~/.claude/skills/` — auto-loaded by the engine

### Projects
- Upload reference documents (code, docs, PDFs)
- Shared knowledge base across conversations
- Files available on-demand via Read tool (no context explosion)
- Project-level instructions injected into every conversation

### Streaming UX
- Tool operations shown in real-time with action labels (Read / Write / Edit)
- Intermediate text interleaved with tool cards chronologically
- Auto-collapse when work completes — only final response shown
- Extended thinking with collapsible thinking blocks

### Frontend
- 1:1 claude.ai-style interface
- Full dark mode with CSS variables
- Markdown rendering (syntax highlighting, KaTeX math, Mermaid diagrams)
- Image attachments with thumbnails and lightbox
- Document preview panel (HTML / JSX live preview)
- Artifacts system with inspiration gallery

## Quick Start

### Download

Grab the latest installer for your platform:

| Platform | Download |
|----------|----------|
| Windows | [`.exe`](../../releases/latest) |
| macOS | [`.dmg`](../../releases/latest) |
| Linux | [`.AppImage`](../../releases/latest) / [`.deb`](../../releases/latest) |

### Setup

1. Install and launch the app
2. Go to **Settings > Models** (gear icon)
3. Add a provider (e.g. `https://dashscope.aliyuncs.com/compatible-mode` for Qwen)
4. Enter your API key
5. Select a model and start chatting

### Build from Source

```bash
git clone https://github.com/pretend1111/claude-desktop-app.git
cd claude-desktop-app

# Install dependencies
npm install
cd engine && bun install && cd ..

# Run in development
npx vite build
npx electron .
```

**Prerequisites:** [Node.js 20+](https://nodejs.org), [Bun](https://bun.sh)

## Architecture

```
Electron App
├── React Frontend (Vite + TailwindCSS)
│   ├── Chat UI with streaming, tool cards, thinking blocks
│   ├── Skills menu, Projects, Artifacts, Settings
│   └── Document panel with live HTML/JSX preview
│
├── Bridge Server (Express, localhost:30080)
│   ├── Conversation / Project / Skill CRUD
│   ├── Chat endpoint → spawns Claude Code engine
│   ├── OpenAI ↔ Anthropic proxy (bidirectional)
│   │   ├── Tool calling conversion
│   │   ├── Thinking mode (enable_thinking ↔ thinking blocks)
│   │   ├── Image block injection
│   │   └── Smart thinking fallback on tool errors
│   └── File upload, image serving, session management
│
├── Claude Code Engine (engine/)
│   ├── Full TypeScript source (runs via Bun)
│   ├── 19+ tools with permission bypass
│   ├── Session persistence with --resume
│   └── Skill loading from ~/.claude/skills/
│
└── Electron Main Process
    ├── Window management, IPC
    └── Auto-updater (GitHub releases)
```

## Configuration

### Providers

Add providers in **Settings > Models**. Supported:

| Provider | Base URL | Format |
|----------|----------|--------|
| Qwen (Aliyun) | `https://dashscope.aliyuncs.com/compatible-mode` | OpenAI |
| DeepSeek | `https://api.deepseek.com` | OpenAI |
| SiliconFlow | `https://api.siliconflow.cn` | OpenAI |
| OpenAI | `https://api.openai.com` | OpenAI |
| Anthropic | `https://api.anthropic.com` | Anthropic |
| Any OpenAI-compatible | Your URL | OpenAI |

### Skills

Skills live in `~/.claude/skills/`. Each skill is a folder with a `SKILL.md`:

```
~/.claude/skills/
├── skill-creator/
│   └── SKILL.md
├── code-review/
│   └── SKILL.md
└── your-custom-skill/
    └── SKILL.md
```

Create skills through the app (use `/skill-creator`) or manually.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, TailwindCSS |
| Build | Vite 6 |
| Desktop | Electron |
| Engine | Claude Code (TypeScript, Bun) |
| Proxy | Node.js HTTP server |
| Markdown | react-markdown, highlight.js, KaTeX, Mermaid |

## Contributing

Issues and PRs welcome. Please open an issue first for feature discussions.

## License

Non-commercial use only. See [LICENSE](LICENSE) for details.

## Star History

If this project is useful to you, please give it a star. It helps others discover it.
