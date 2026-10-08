# Honeypot & Intrusion-Attempt Monitoring — Service Methodology

_A real, deliverable security service. Replaces "Neural Deception" fiction with an actual, well-established technique._

## What this service actually is

Deployment of decoy routes/endpoints on a client's website or API that no legitimate user or script would ever request — fake admin panels, fake `.env` files, fake config/backup files, common scanner targets. Any request to a decoy is logged with real, verifiable data (timestamp, IP, method, path, user-agent). Because these routes have zero legitimate traffic, a hit is a strong, honest signal of scanning or attack activity — not a guess, not an AI inference.

This is a decades-old, industry-standard technique (canary tokens / honeypot routes), not artificial intelligence. Its credibility comes from being simple and provably real.

## Who it's for

Any site or API that's a plausible scanning target — which is nearly all public-facing sites. Particularly useful for:

- Shopify/e-commerce admin panels (attackers scan for `/wp-admin`, `/admin` reflexively even on non-WordPress stores)
- Small business sites with a login system
- Anyone who wants early warning before a real attack, not just after

## Scope of a typical engagement

| Phase                     | What happens                                                                                                                                           | Deliverable                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| 1. Scoping                | Confirm the site's real routes so decoys never collide with them; agree on log retention and alerting preferences                                      | Written scope note                              |
| 2. Deployment             | Install `honeypot.js` middleware (Node/Express) or an equivalent decoy set for the client's stack; configure logging path and optional webhook alert   | Deployed decoys, confirmed live with a test hit |
| 3. Monitoring period      | Decoys run silently in production, logging any hits                                                                                                    | Ongoing JSONL/DB log                            |
| 4. Report                 | Run `report.js` against the log; deliver a plain-English summary: total hits, top source IPs, most-probed paths, timeline                              | Written report (weekly/monthly, per agreement)  |
| 5. Escalation (as needed) | If a hit pattern suggests active targeting (same IP hitting multiple decoys rapidly), flag it immediately rather than waiting for the scheduled report | Real-time alert                                 |

## What the tool actually does (see `honeypot.js` + `report.js`)

- Registers ~16 default decoy routes covering common attacker scan targets (`/wp-admin`, `/.env`, `/phpmyadmin`, `/.git/config`, `/api/admin`, etc.) — extensible per client
- Logs every hit with real request data to a JSONL file
- Responds to decoy hits with an ordinary 404 (same as a real missing route) so the decoy is never revealed to the prober
- Optional webhook (Slack/Discord/etc.) fires in real time on any hit
- `report.js` turns the raw log into a summarized report: total hits, unique IPs, most-probed paths, hits-by-day timeline

## What requires manual judgment (the actual service, beyond the script)

- Deciding which decoy paths make sense for a given client's stack (a Shopify store has different plausible attacker targets than a custom Node app)
- Interpreting patterns: is this background internet noise (constant low-level scanning happens to everyone) or a targeted, escalating attempt worth an urgent call?
- Advising on next steps when a real attack pattern shows up — e.g. recommending a WAF rule, IP block, or deeper log review elsewhere on the server
- Making sure decoys don't accidentally shadow a real route (a one-time review during setup, and after any client site changes)

## Framing this honestly to clients

- This tool does **not** stop attacks — it detects and logs probing attempts. It's an early-warning system, not a firewall.
- A quiet report ("zero hits this month") is a legitimate, useful result — don't oversell inevitability of findings.
- Never claim this replaces a WAF, rate limiting, or proper access control — it complements those, per the Access Control & Authentication Audit service.

## Legal & ethical guardrails

- Honeypots only log inbound requests to routes you control on your own/client's server — this is passive logging of traffic already arriving at the site, not a probe of anyone else's system. No special authorization concerns beyond the standard client engagement agreement.
- Be transparent with clients about what's being logged (IP addresses are personal data in some jurisdictions, e.g. under GDPR-style frameworks) and how long logs are retained.

## Suggested starting price point

- Setup: a flat one-time fee for deploying and verifying the decoy set
- Optional ongoing: a small monthly fee for report generation + monitoring, or bundle it with the Access Control & Authentication Audit as a combined "security baseline" package
