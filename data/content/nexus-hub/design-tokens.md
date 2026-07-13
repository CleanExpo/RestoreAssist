# Design tokens — Unite-Group (group / Mission Control)

Product UIs (e.g. RestoreAssist gold/navy) keep their own tokens. These apply to **Nexus Hub**, Hermes Command Center (`/ops`), static Mission Control hub, and future **Unite-Hub CRM** chrome.

## Mission Control palette (CEO CRM colours)

| Name | Hex | CSS variable (palette) |
|------|-----|------------------------|
| Midnight Candy Apple | `#033500` | `--color-midnight-candy` |
| Deep Candy Shadow Green | `#004206` | `--color-deep-candy-shadow` |
| Forest Candy Metallic | `#0B4F14` | `--color-forest-candy` |
| Chantilly Lace | `#F6F6F3` | `--color-chantilly-lace` |

Chantilly Lace is off-white — reads as white on dark metallics. Stack the two dark greens for depth; Forest Candy for cards and panels.

## Mission Control (role tokens — light CRM)

CEO preference: **white page** with candy greens for chrome, headings, and buttons.

| Token | Value | Usage |
|-------|-------|--------|
| `--bg-base` | `#FFFFFF` | Page background |
| `--bg-panel` | `#F6F6F3` | Status strip, soft inset (Chantilly Lace) |
| `--bg-elevated` | `#FFFFFF` | Cards and panels (border defines shape) |
| `--text-primary` | `#033500` | Body text (Midnight Candy Apple) |
| `--text-muted` | `rgba(3, 53, 0, 0.72)` | Labels, metadata |
| `--text-on-accent` | `#F6F6F3` | Text on filled green buttons |
| `--accent` | `#0B4F14` | Links, primary button fill (Forest Candy) |
| `--accent-muted` | `#004206` | Secondary borders, panel headings |
| `--border` | `rgba(11, 79, 20, 0.22)` | Panel borders |
| `--success` | `#5CB86A` | Hermes online (harmonised green) |
| `--warning` | `#E8B84A` | Stale / degraded |
| `--danger` | `#E87A7A` | Offline / error |

## Typography

| Role | Stack |
|------|--------|
| UI | `Inter`, `system-ui`, sans-serif |
| Mono (paths, IDs) | `JetBrains Mono`, `Consolas`, monospace |

## Spacing

- Base unit: `4px`
- Card padding: `16px` / `24px` desktop
- Ops rail width: `240px` (see HERMES-COMMAND-CENTER-PLAN)

## Motion

- Prefer `150–200ms` ease for hover/focus; no bounce easing on ops UI.
- Status pulses: subtle opacity only (accessibility).

## Authority / marketing site (Unite-Group landing)

When editing `CleanExpo/Unite-Group` (Authority Site): align with Synthex authority positioning — defer to that repo’s tokens when in conflict; group accent may use gold/navy from RestoreAssist **only** for cross-product footer CTAs, not Mission Control chrome.

## Reference

- Hermes theme: align `command-center` in `%LOCALAPPDATA%\hermes\config.yaml` when ops UI is updated
- Static hub: `mission-control/index.html` + `mission-control.css`
- Wiki: [[concepts/command-center-console]], [[concepts/mission-control]]
