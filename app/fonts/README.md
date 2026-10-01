# Bundled application fonts

The application uses local copies of its existing Outfit, Plus Jakarta Sans,
Geist and Geist Mono families. `next/font/local` retains preload, `display: swap`,
fallback adjustment and the existing CSS variables without fetching Google CSS
during development or production builds.

This removes a build-time network dependency. Main's Sketch E2E run 36858604408
failed before billing tests could start because Next.js 16.3.6 could not compile
an Outfit import (`next/font/google queries have exactly one entry`). The error
matches https://github.com/vercel/next.js/issues/99114; the CI log truncates the
font URL, so its precise upstream response cannot be recovered from that log.

`manifest.json` records immutable Google Fonts source URLs, original TTF hashes,
bundled WOFF2 hashes and variable weight ranges. Each family's SIL Open Font
License is included alongside its font, with only trailing whitespace normalized.
The WOFF2 files contain the complete original glyph sets and axes; no subsetting or design changes were made.

To reproduce the format conversion, download each manifest source, verify its
`sourceSha256`, and use Python with fontTools 4.61.1 and Brotli 1.2.0:

```python
from fontTools.ttLib import TTFont

font = TTFont(source_path, recalcTimestamp=False)
font.flavor = "woff2"
font.save(destination_path)
```

The dependency versions above are conversion tools, not application runtime
dependencies. The four bundled font files total 246,620 bytes.

The complete glyph sets may require more cold-download bytes than the former
Latin subsets. Local fallback metrics are computed by Next from these files and
can differ slightly from the Google loader's precomputed metrics; exact layout
shift equivalence is not claimed.
