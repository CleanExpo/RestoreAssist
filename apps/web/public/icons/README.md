# RestoreAssist PWA Icons

Generate the following PNG files from `icon.svg` before deploying PWA support:

| File                 | Size    | Purpose                    |
|----------------------|---------|----------------------------|
| `icon-96.png`        | 96x96   | Shortcut icons             |
| `icon-192.png`       | 192x192 | Android home screen (maskable) |
| `icon-512.png`       | 512x512 | Splash screen / store listing |
| `apple-touch-icon.png` | 180x180 | iOS home screen            |

## Generating icons

Use any of these approaches:

```bash
# Using sharp-cli
npx sharp-cli -i icon.svg -o icon-96.png resize 96
npx sharp-cli -i icon.svg -o icon-192.png resize 192
npx sharp-cli -i icon.svg -o icon-512.png resize 512
npx sharp-cli -i icon.svg -o apple-touch-icon.png resize 180
```

For maskable icons, ensure the important content stays within the safe zone (the inner 80% circle).
