# Paid-pilot evidence record

Copy this template to the approved private evidence system for each release.
Do not add customer personal data, credentials, tokens or report contents to
the repository.

## Release identity

| Field                                  | Value                       |
| -------------------------------------- | --------------------------- |
| Git revision                           |                             |
| Working tree clean                     |                             |
| Node version                           |                             |
| Deployment ID / immutable image digest |                             |
| Production origin                      | `https://restoreassist.app` |
| Migration fingerprint                  |                             |
| Gate 0 verifier and UTC time           |                             |

## Automated preflight

| Acceptance             | Result | Tests run | Receipt/evidence |
| ---------------------- | ------ | --------- | ---------------- |
| A1 signup              |        |           |                  |
| A2 payment             |        |           |                  |
| A3 invites             |        |           |                  |
| A4 reports             |        |           |                  |
| A5 email               |        |           |                  |
| A6 tenant provisioning |        |           |                  |

## Customer acceptance

| Customer slot | A1  | A2  | A3  | A4  | A5  | A6  | Revenue reconciled | 24h status |
| ------------- | --- | --- | --- | --- | --- | --- | ------------------ | ---------- |
| 1             |     |     |     |     |     |     |                    |            |
| 2             |     |     |     |     |     |     |                    |            |
| 3             |     |     |     |     |     |     |                    |            |
| 4             |     |     |     |     |     |     |                    |            |
| 5             |     |     |     |     |     |     |                    |            |

## Decision

| Field                                              | Value |
| -------------------------------------------------- | ----- |
| P0/P1 open                                         |       |
| Decision (`continue`, `hold`, `rollback`, `close`) |       |
| Decision owner                                     |       |
| Independent verifier                               |       |
| UTC time                                           |       |
| Reason and next gate                               |       |
