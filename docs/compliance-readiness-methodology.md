# Compliance Readiness Checklist — Service Methodology

_A real, deliverable compliance service. Replaces "AI Compliance Engine" fiction with an actual gap-analysis grounded in named, current regulatory sources._

## What this service actually is

A structured review of a client's business against a specific, named compliance framework — not a generic "AI compliance score." The client gets a working spreadsheet (`compliance-readiness-checklist.xlsx`) covering real requirements, with each one assessed as Compliant / Partial / Non-Compliant / Not Applicable, backed by evidence notes, not an automated guess.

The two frameworks covered out of the box are the ones most directly relevant to a Kenya-based e-commerce/Shopify business:

1. **PCI DSS — SAQ A** (Self-Assessment Questionnaire A): applies to merchants using a fully hosted, PCI-compliant checkout (e.g. Shopify Payments' default hosted checkout). Based on **PCI DSS v4.0.1**, effective 31 March 2025 — including the newer script-authorization requirements (6.4.3) that catch many Shopify merchants who've added analytics, chat, or review-app scripts to their checkout page without realizing it affects their SAQ eligibility.
2. **Kenya Data Protection Act, 2019 (DPA)**: Kenya's principal data-protection law, enforced by the Office of the Data Protection Commissioner (ODPC). Covers registration duties, lawful processing, data subject rights, security measures, and the 72-hour breach notification duty.

## Who it's for

Any Kenya-based e-commerce or web business — a natural fit for Shopify merchants (like VersaPro) who take payments and collect customer data but have never formally checked their obligations under either framework.

## Scope of a typical engagement

| Phase                   | What happens                                                                                                                                                                   | Deliverable                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 1. Scoping              | Confirm which framework(s) apply — does the client take payments directly (PCI), and do they collect/process Kenyan customer data (DPA — almost always yes for any storefront) | Scoping note                      |
| 2. Walkthrough          | Go through the checklist item by item with the client (or on their behalf using available evidence — store settings, privacy policy, admin access list)                        | Filled-in draft checklist         |
| 3. Evidence review      | For each item marked Compliant, confirm there's something concrete backing it up (a screenshot, a policy document, a setting) — not just "I think so"                          | Annotated checklist               |
| 4. Gap report           | Summarize what's Non-Compliant or Partial, prioritized, in plain English                                                                                                       | Written summary + the spreadsheet |
| 5. Follow-up (optional) | Re-check after the client addresses gaps                                                                                                                                       | Updated checklist                 |

## What's in the spreadsheet (see `compliance-readiness-checklist.xlsx`)

- **Instructions tab** — how to use it, which framework(s) apply, and an explicit note that this is a starting point, not a substitute for a lawyer, a Qualified Security Assessor (QSA), or the ODPC's own guidance
- **PCI DSS SAQ A tab** — 9 real requirements drawn from the actual SAQ A / PCI DSS v4.0.1 text, with Status/Priority dropdowns and an Evidence/Notes column
- **Kenya DPA 2019 tab** — 9 real requirements drawn from the Act (registration thresholds, lawful basis, data subject rights, security measures, breach notification, DPO designation)
- **Summary tab** — live formula-driven counts (not hardcoded) of Compliant/Partial/Non-Compliant/Not Applicable/Not Reviewed across both frameworks, so the client sees their overall standing at a glance and it updates automatically as they fill in status

## What requires your judgment (the actual service, beyond the spreadsheet)

- Confirming which framework(s) genuinely apply to a specific client's setup (e.g. SAQ A eligibility depends on exact checkout configuration, not just "I use Shopify")
- Interpreting ambiguous cases — e.g. whether a specific app on a payment page breaks SAQ A eligibility is often not obvious without checking exactly what that app injects
- Knowing when something is genuinely a legal question (e.g. cross-border data transfer adequacy) and needs a lawyer, rather than guessing
- Helping the client actually fix flagged gaps, not just identify them — e.g. drafting the missing privacy policy language, or connecting the Access Control Audit findings to the DPA's "appropriate technical and organisational measures" requirement

## Framing this honestly to clients

- This checklist is a **snapshot assessment tool**, not a certification. Passing every item on this list doesn't mean a QSA or the ODPC would certify the business — it means the obvious, checkable gaps are closed.
- Regulatory requirements change (PCI DSS SAQ A itself changed in early 2025) — recommend clients re-run this at least yearly, and immediately after any checkout or major data-handling change.
- Never claim this replaces registering with the ODPC, engaging a QSA for higher PCI levels, or getting a lawyer's sign-off on legal-basis or cross-border transfer questions — flag those explicitly rather than quietly answering them.

## Suggested starting price point

- A flat fee for the full walkthrough + filled checklist + written gap summary across both frameworks, since scope is well-defined.
- Follow-up re-checks after remediation can be priced as a smaller fixed add-on.

## Sources

- PCI Security Standards Council — SAQ A and PCI DSS v4.0.1 (effective 31 March 2025, including Requirements 6.4.3 and 11.6.1 script-security updates)
- Kenya Data Protection Act, 2019 (Act No. 24 of 2019)
- Data Protection (General) Regulations, 2021
- Office of the Data Protection Commissioner (ODPC) public guidance
