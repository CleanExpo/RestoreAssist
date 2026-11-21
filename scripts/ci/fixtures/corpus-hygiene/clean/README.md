# Corpus-hygiene CI fixture (RA-7790)

This folder is the clean input the PR Quality Gates workflow scans with
`node scripts/ci/check-corpus-hygiene.mjs --dir scripts/ci/fixtures/corpus-hygiene/clean --strict`.

The real staging tree is the operator's ingest folder and is not committed, so
CI proves the gate runs, finds files and exits 0 on clean text. Keep every file
here free of charge-out rates. Adding a rate line to any file must turn the
workflow step red.
