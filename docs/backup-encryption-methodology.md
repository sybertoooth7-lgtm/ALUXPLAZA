# Data Backup & Encryption Audit — Service Methodology

_A real, deliverable security service. Replaces "Neural Data Vault" fiction with an actual, testable review of backup and encryption practices._

## What this service actually is

A review of how a client stores and backs up sensitive data — customer records, order exports, credentials, database dumps — checking whether it's actually encrypted at rest and in transit, and whether backups are exposed by common misconfigurations (world-readable files, unencrypted archives, public cloud storage buckets). Every finding is backed by a real, reproducible check: a file permission read, a functional password-protection test on an archive, or a real (passive, anonymous) HTTP request — never a simulated score.

## Who it's for

Any business handling customer data exports — a direct fit for Shopify merchants who regularly export order/customer CSVs, database backups, or app configuration files, and may not have thought about where those exports end up or how they're protected once created.

## Scope of a typical engagement

| Phase                | What happens                                                                                                                                                                           | Deliverable        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1. Scoping           | Identify where the client's backups/exports actually live — local machine, cloud storage, email attachments, a hosting provider's backup feature                                       | Scoping note       |
| 2. Local/folder scan | Run the audit tool against the client's actual backup folder(s): flags plaintext sensitive files, weak permissions, unencrypted archives                                               | Raw findings       |
| 3. Remote checks     | If backups go to a URL/cloud endpoint, check transport security (HTTPS/TLS) and, if a cloud storage bucket is used, check for public exposure                                          | Raw findings       |
| 4. Manual review     | Check for things the tool can't fully verify: retention policy (how long are old backups kept?), who has access to the backup location, whether backups are actually tested/restorable | Annotated findings |
| 5. Report            | Plain-English report: what was found, why it matters, how to fix it, prioritized                                                                                                       | Written report     |

## What the automated tool checks (see `backup_audit.py`)

1. **Local backup folder scan** — walks a given folder and flags plaintext sensitive files (SQL/CSV/JSON exports, `.env` files, private keys) and specifically calls out any that are also world-readable (any local user/process could read them)
2. **Archive encryption check** — for any `.zip` files found, performs a real functional test of whether the archive is password-protected (not a guess based on the filename)
3. **Backup destination transport security** — if backups go to a URL, checks it's served over valid HTTPS/TLS
4. **Cloud storage public-exposure check** — if a cloud storage bucket name is given, performs a real, passive, anonymous HTTP request to check whether the bucket allows public listing — a genuinely common and serious real-world misconfiguration, not a hypothetical

## What requires manual review (not automatable, and where your judgment/labor is the actual product)

- Retention policy: are old backups deleted on a schedule, or accumulating indefinitely (a bigger target the longer they sit around)?
- Access control: who actually has access to the backup location, and is that list current?
- Restorability: has a backup actually been test-restored recently? An unencrypted-but-untested backup and an encrypted-but-untested backup share the same real risk — data loss — that encryption alone doesn't address.
- Where credentials for backup/cloud storage access are themselves stored (a backup system whose own access key is stored in plaintext next to the backups defeats the purpose)

## Framing this honestly to clients

- This tool checks what it can directly observe (files, permissions, archive encryption, public accessibility) — it cannot verify cloud-provider-side encryption-at-rest settings without credentials, so those are flagged as "confirm manually in your provider's console" rather than guessed at.
- A "no findings" result means the checked items are fine, not that data is invulnerable — pair this with the Access Control Audit for a fuller picture.
- Never claim 100% security — flag genuine unknowns as unknowns rather than assuming compliance.

## Legal & ethical guardrails

- The local folder scan only reads file metadata/permissions, never the actual sensitive contents.
- The S3/cloud bucket check is a single anonymous GET request — the same kind of request any web browser makes — performed only against buckets the client owns or has authorized you to check.
- Never attempt to access, download, or exfiltrate data from a bucket found to be publicly exposed — report the finding immediately and stop.

## Suggested starting price point

- A flat fee for the folder scan + remote/cloud checks + written report, since scope is well-defined once the client identifies where their backups live.
