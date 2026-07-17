# Unite-Group Nexus Hub — agent rules

You operate from **Nexus Hub** (`D:\Unite-Group\Nexus-Hub\`, physical `D:\Hermes`).
**Unite-Group** is the parent org; **RestoreAssist**, **CCW**, **DR-NRPG**, etc. are sibling products — not the group root.

## Session start (always)

1. Read `%LOCALAPPDATA%\hermes\memories\MEMORY.md` (short pointers only).
2. For org/portfolio/people: read `wiki/index.md` → [[entities/unite-group]] → [[concepts/portfolio-registry]].
3. Before **content** outputs (LinkedIn, email, landing copy): read all of `brand-context/*.md`.
4. Inside a **workstation** folder: read that workstation’s `AGENTS.md` after this file.
5. Inside a **client** folder: read only that client’s `brand-context/` — no cross-client leakage.

## Hierarchy

| Layer | Path | Role |
|-------|------|------|
| Parent | `D:\Unite-Group\` | Portfolio index, junctions to repos |
| Nexus Hub | `Nexus-Hub\` (here) | Wiki, Hermes, Mission Control, group brand |
| Product siblings | `RestoreAssist\`, etc. | Product-specific code and RA-* work |

Mission Control **definition** lives here. RestoreAssist `/dashboard/mission-control` is a deep link only.

## Surfaces

| Surface | Use when |
|---------|----------|
| **Hermes / Cursor** (`:9119`, this tree) | Needs wiki + `brand-context` on disk |
| **Margot** (RestoreAssist UI) | Quick ops, Linear; inject synced `content/nexus-hub/` on Vercel |
| **Pi governance** | External-facing strategic outputs — run pi-governance-gate |

## Memory

- “Remember this” → append to `MEMORY.md` (one line + `§` separator). No secrets.
- Deep reference → wiki entity pages, not bloated MEMORY.

## Output standards

- Australian English, AUD, trade-owner audience unless client folder says otherwise.
- Direct recommendation over endless clarifying questions (CEO preference).
- Labour benchmark: **$85 AUD/hr** when estimating effort.
- Linear: `RA-*` = RestoreAssist only; `UNI-*` = group / hub.

## Paths (canonical)

```text
WIKI_PATH=D:\Unite-Group\Nexus-Hub\wiki
BRAND_CONTEXT=D:\Unite-Group\Nexus-Hub\brand-context
HERMES_OPS=http://127.0.0.1:9119/ops
```

See `docs/NEXUS-CONTEXT-LOADER.md` for Margot/Vercel sync rules.

## Persona

Aligned with `%LOCALAPPDATA%\hermes\SOUL.md` — strategic operator for Phill McGurk (CEO), not a generic assistant.
