# Post-Quantum Cryptography Readiness Assessment — Service Methodology

_A real, deliverable, forward-looking security service. Replaces "Quantum Neural Cryptography" fiction with an honest assessment grounded in NIST's actual finalized standards._

## What this service actually is

An inventory of which cryptographic algorithms a client's public-facing systems currently use (RSA, ECC, etc.), all of which are vulnerable to a sufficiently powerful future quantum computer via Shor's algorithm, plus a practical readiness checklist for migration — not a claim that quantum computers can break anything today. This is a genuinely longer-horizon, lower-urgency service compared to the other 8, and should be sold and framed that way.

## The real, current facts (not hype)

- NIST finalized the first post-quantum cryptography standards on **13 August 2024**: **FIPS 203 (ML-KEM)** for key exchange, **FIPS 204 (ML-DSA)** for digital signatures, and **FIPS 205 (SLH-DSA)** as a hash-based signature backup.
- NIST's draft transition guidance (NIST IR 8547) targets **deprecating RSA-2048 and ECC P-256 by 2030**, and removing quantum-vulnerable algorithms from NIST standards entirely by **2035**.
- Most credible expert estimates place a cryptographically relevant quantum computer (one actually capable of breaking RSA-2048) in the **mid-2030s or later** — this is not an imminent threat, but planning timelines of 5-10 years are exactly why organizations are told to start now.
- The nearer-term real risk is **"harvest now, decrypt later"**: an adversary records encrypted traffic today and decrypts it once a capable quantum computer exists. This matters most for data that needs to stay confidential for a long time (a decade or more) — for most small e-commerce businesses, this is a real but lower-priority concern compared to the other 8 services.
- Major infrastructure providers (Cloudflare, Google, AWS, Chrome) have already deployed hybrid post-quantum key exchange in production — the migration is actively happening at the infrastructure layer, largely invisible to small businesses relying on those providers.

## Who it's for

Any business wanting a forward-looking security roadmap, or handling data that genuinely needs long-term confidentiality (health data, legal records, anything with a multi-year sensitivity window). For a typical Shopify merchant, this service is honestly **lower priority** than the other 8 — worth saying so explicitly to clients rather than oversell it.

## Scope of a typical engagement

| Phase             | What happens                                                                                                                      | Deliverable          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1. Scoping        | Confirm domain(s)/systems in scope                                                                                                | Scoping note         |
| 2. Automated pass | Run the assessment tool: certificate algorithm/key size, TLS version, hybrid PQC key exchange support                             | Raw findings         |
| 3. Context review | Identify which of the client's data genuinely needs long-term confidentiality (this determines real urgency, not a generic score) | Prioritization notes |
| 4. Report         | Plain-English report explaining current posture, realistic timeline, and next steps                                               | Written report       |

## What the automated tool checks (see `pqc_readiness.py`)

1. **Certificate algorithm & key size** — identifies RSA vs. ECDSA and key size; flags undersized keys (e.g. under 2048-bit RSA) as an urgent classical (non-quantum) weakness, separate from the quantum question
2. **TLS version** — confirms TLS 1.3, a prerequisite for any hybrid PQC key exchange
3. **Hybrid PQC key exchange support** — attempts to detect support for known hybrid groups (e.g. `X25519MLKEM768`); **honestly reports when this can't be determined** due to the testing machine's OpenSSL version being older than 3.5, rather than guessing

## Important limitation — be upfront about this

Testing for actual hybrid PQC key exchange support requires OpenSSL 3.5+ (or an equivalent PQC-capable TLS client) on the machine running the audit. Many systems, including the one this tool was developed and tested on, don't have this yet. When this check can't run, the tool says so explicitly rather than reporting a false PASS or FAIL — **never present an "info: couldn't determine" as a negative finding to a client.**

## Framing this honestly to clients

- This is the **least urgent** of the 9 real services on offer — say so. A client's limited security budget is almost always better spent on Access Control, Network Hardening, or the Vulnerability Assessment first.
- Never suggest "quantum computers will break your site soon" — that's not accurate and undermines trust in every other honest finding in the report.
- The realistic recommendation for most small businesses today: know that this is coming, keep an eye on your hosting/CDN provider's PQC rollout (most of the real migration work happens at that layer, not the application layer), and revisit this assessment in a year or two rather than treating it as urgent now.

## Suggested starting price point

- A lower-cost add-on to another engagement (e.g. bundled with the Network Hardening Audit) rather than a standalone service, given its lower urgency — pricing should reflect that this is forward-looking context, not urgent remediation work.

## Sources

- NIST FIPS 203, 204, 205 (finalized 13 August 2024)
- NIST IR 8547 (draft transition guidance)
- Public reporting on hybrid PQC deployment by Cloudflare, Google, and major browsers (2025-2026)
