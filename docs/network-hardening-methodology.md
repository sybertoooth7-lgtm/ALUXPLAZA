# Firewall & Network Hardening Audit — Service Methodology

_A real, deliverable network security service. Replaces "Neural Perimeter Defense" fiction with an actual, tested review of a domain's network exposure._

## What this service actually is

A review of what a client's domain/servers expose to the internet: open management/database ports that shouldn't be internet-facing, email-spoofing defenses (SPF/DMARC), DNS hygiene (CAA records), and TLS certificate health. Every finding comes from a real, capped, passive TCP connection or DNS lookup — the same category of check a legitimate network audit performs, not a simulated AI scan.

## Who it's for

Any business running its own server/VPS/backend (a fit for the Alux Plaza Node.js backend itself, or any client with self-managed infrastructure — less relevant for a pure Shopify-hosted storefront with no self-managed server, though the email security checks (SPF/DMARC) apply to any domain sending email, including Shopify stores).

## Scope of a typical engagement

| Phase                   | What happens                                                                                                                                            | Deliverable          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1. Scoping              | Confirm the domain(s)/IP(s) in scope and get written authorization — required every time, even for a client's own site                                  | Signed scope-of-work |
| 2. Automated pass       | Run the audit tool: capped port scan, SPF/DMARC check, CAA check, TLS expiry check                                                                      | Raw findings         |
| 3. Manual review        | Review anything flagged, plus checks the tool can't do (firewall rule review if you have server access, VPN configuration review, network segmentation) | Annotated findings   |
| 4. Report               | Plain-English report: what's exposed, why it matters, how to fix it, prioritized                                                                        | Written report       |
| 5. Follow-up (optional) | Re-scan after remediation                                                                                                                               | Confirmation report  |

## What the automated tool checks (see `network_audit.py`)

1. **Port scan** — a capped, TCP-connect-only scan of 10 commonly-exposed management/database ports (SSH, RDP, MySQL, PostgreSQL, Redis, MongoDB, Elasticsearch, Telnet, FTP, SMTP) — not a stealth scan, not a full port sweep
2. **Email security** — checks for SPF and DMARC DNS records, and flags a DMARC policy set to `p=none` (monitoring-only, not actually enforced) as worth tightening
3. **DNS hygiene** — checks for a CAA record restricting which Certificate Authorities can issue TLS certs for the domain
4. **TLS certificate expiry** — checks the certificate on port 443 and flags anything expiring within 14 days or already expired

## What requires manual review (not automatable, and where your judgment/labor is the actual product)

- Actual firewall rule review (requires server/console access, not just an external scan) — e.g. reviewing security group rules on a cloud provider, or `iptables`/`ufw` rules on a VPS
- VPN configuration review, if the client uses one to access management ports instead of exposing them directly
- Network segmentation — whether internal services are properly isolated from public-facing ones
- Interpreting _why_ a port is open — sometimes there's a legitimate reason (e.g. a load balancer health check) that the client needs to confirm rather than you assuming it's a mistake

## Framing this honestly to clients

- A capped 10-port scan is a real, useful baseline check — it is not a comprehensive penetration test. Say so explicitly rather than implying full coverage.
- "No open ports found" among the scanned list means exactly that — it doesn't mean the server has no vulnerabilities elsewhere.
- Never scan beyond what's authorized — this tool intentionally checks a small, fixed port list rather than sweeping the full range, both for legal/ethical reasons and because a small, explainable list is what a real client engagement should authorize.

## Legal & ethical guardrails (non-negotiable)

- Written authorization before any scanning, every time — even against a client's own infrastructure.
- The port scan uses ordinary TCP connect attempts only — the same kind of connection any legitimate client makes — never a stealth/SYN scan or anything designed to evade detection.
- Never scan third-party infrastructure (e.g. a client's hosting provider's shared infrastructure) without separately confirming the hosting provider's acceptable-use policy permits it.

## Suggested starting price point

- A flat fee for the scan + manual firewall/VPN review (where server access is available) + written report.
