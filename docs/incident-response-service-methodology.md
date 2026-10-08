# Incident Response Plan & Playbook — Service Methodology

_A real, deliverable security service. Replaces "Autonomous Incident Response" fiction with an actual written IR plan grounded in NIST SP 800-61._

## What this service actually is

A written, client-specific Incident Response (IR) plan: what to do, in what order, and who does it, if the client's site/systems are breached. This is not automation — no AI "orchestrates containment." It's a document a real human follows during a real bad day, built once and rehearsed, so decisions aren't made from scratch under pressure.

Grounded in the **NIST SP 800-61 Computer Security Incident Handling Guide** framework (Preparation → Detection & Analysis → Containment/Eradication/Recovery → Post-Incident Activity) — the industry-standard reference, not invented terminology.

## Who it's for

Any small business or site operator without an internal security team — which describes almost every solo Shopify merchant, small SaaS operator, or freelance-built web app. Most have never written down what they'd actually do if hacked.

## Scope of a typical engagement

| Phase                                        | What happens                                                                                                                                                                  | Deliverable                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1. Intake interview                          | Ask about the client's systems, who has access, what's most critical (customer data? payment processing? uptime?), existing tools (hosting provider, backups, admin accounts) | Intake notes                                       |
| 2. Drafting                                  | Fill the IR Plan template with the client's specific systems, contacts, and decision points                                                                                   | Draft IR Plan                                      |
| 3. Review                                    | Walk the client through the plan; confirm contact info, escalation paths, and that they understand their own role in it                                                       | Revised IR Plan                                    |
| 4. Tabletop exercise (optional, recommended) | A short talk-through of a hypothetical incident ("customer data appears in a breach forum — what do you do first?") to pressure-test the plan                                 | Session notes / plan revisions                     |
| 5. Delivery                                  | Final signed-off plan, in a format the client can actually find and use during a real incident (not buried in an inbox)                                                       | Final PDF/Word document + printed copy recommended |

## What's in the actual plan (see `incident-response-plan-template`)

1. **Roles & contacts** — who is the incident lead, who else to call (hosting provider support, domain registrar, a lawyer if relevant, payment processor if card data might be involved)
2. **Classification** — how to size up severity quickly (e.g. defaced page vs. leaked customer data vs. ransomware) so response effort matches real risk
3. **Immediate containment steps** — the first 30 minutes: what to disable, what NOT to do (don't wipe evidence, don't post publicly before understanding scope)
4. **Investigation checklist** — where to look for evidence (server logs, admin activity logs, payment gateway logs, hosting provider's access logs)
5. **Recovery steps** — restoring from backup, rotating credentials/API keys/JWT secrets, re-verifying the fix before reopening
6. **Communication templates** — a draft customer notification, and note on legal disclosure obligations (varies by jurisdiction — flag rather than give legal advice)
7. **Post-incident review** — what to change afterward so it doesn't happen the same way twice

## What requires your judgment (the actual service, beyond the template)

- Translating a generic framework into the client's specific stack (a Shopify store's IR plan looks different from a custom Node/Express app's)
- Identifying realistic threat scenarios for their specific business, not generic ones
- Facilitating the tabletop conversation — this is where plans get actually useful, not just filed away
- Knowing when to say "this needs a lawyer" (data breach notification laws) rather than guessing

## Framing this honestly to clients

- This is a **plan**, not a guarantee — it reduces panic and wasted time during a real incident, it doesn't prevent incidents (that's what the Access Control Audit and Honeypot Monitoring services are for).
- Don't oversell "response time" numbers — a plan followed by a human takes as long as it takes; there's no fictional "12ms response."
- Recommend the client actually revisit/update the plan periodically (e.g. yearly, or after any major system change) — a stale plan with outdated contacts is nearly useless.

## Suggested starting price point

- A flat fee for the intake interview + drafted plan + one review round, since scope is well-defined upfront.
- The optional tabletop session can be priced separately as a follow-on, since it's more time-intensive and higher-value.
