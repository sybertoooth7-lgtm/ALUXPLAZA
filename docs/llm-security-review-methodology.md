# AI/LLM Application Security Review — Service Methodology

_A real, deliverable security service. Replaces "Adversarial AI Defense" fiction with an actual black-box test of AI-backed application features, grounded in the OWASP Top 10 for LLM Applications (2025 edition)._

## What this service actually is

A security review of a client's AI-backed feature — a chatbot, AI product recommender, AI customer support widget, or similar — testing whether the _application wrapping the model_ is safe, not the underlying model itself. This distinction matters: this service doesn't try to "fix" a language model's behavior in the abstract; it tests whether the client's specific integration handles that behavior safely (validates output before rendering it, doesn't over-trust user input, has usage limits, etc.).

Grounded in the **OWASP Top 10 for LLM Applications (2025 edition, LLM01:2025-LLM10:2025)** — the current, community-maintained, named industry-standard reference for this category, published by the OWASP GenAI Security Project.

## Who it's for

Any business adding an AI-backed feature to their site or app — increasingly relevant as small businesses adopt AI chatbots and assistants. Directly relevant to your own future plans if Alux Plaza or VersaPro ever add an AI chat/support feature — this is genuinely a service space with very few small-business-focused providers yet.

## Scope of a typical engagement

| Phase                   | What happens                                                                                                                                                  | Deliverable          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1. Scoping              | Identify the AI-backed endpoint(s) in scope, confirm the request/response format, get written authorization                                                   | Signed scope-of-work |
| 2. Automated pass       | Run the review tool: prompt injection, system prompt leakage, output handling, rate limiting                                                                  | Raw findings         |
| 3. Manual review        | Review flagged WARN items (leakage heuristics can have false positives - see limitation below), plus the categories the tool can't test black-box (see below) | Annotated findings   |
| 4. Report               | Plain-English report, mapped to OWASP LLM categories, prioritized                                                                                             | Written report       |
| 5. Follow-up (optional) | Re-test after remediation                                                                                                                                     | Confirmation report  |

## What the automated tool checks (see `llm_security_review.py`)

1. **LLM01:2025 Prompt Injection** — sends known instruction-override patterns ("ignore all previous instructions...") and checks whether the model complies instead of maintaining its intended behavior
2. **LLM07:2025 System Prompt Leakage** — sends known prompt-extraction patterns and checks the response for indicators of leaked internal instructions
3. **LLM05:2025 Improper Output Handling** — sends a payload containing an HTML `<script>` tag and SQL-like syntax, checks whether it's echoed back unescaped (a real risk if that output is later rendered in a browser or used in a downstream query without sanitization)
4. **LLM10:2025 Unbounded Consumption** — a small, capped burst of requests to check for rate limiting (each LLM call typically has a real per-call cost, making an unthrottled endpoint a genuine financial risk, not just a performance one)

Verified against both a deliberately vulnerable mock endpoint (all 4 checks correctly failed) and a hardened mock endpoint (all 4 checks correctly passed, zero false positives) during development.

## What requires manual/architectural review — the tool cannot black-box test these

- **LLM02:2025 Sensitive Information Disclosure** — requires knowing what data the system has access to, not just probing the API from outside
- **LLM03:2025 Supply Chain** — requires reviewing which third-party models, libraries, and plugins are used and their provenance
- **LLM04:2025 Data and Model Poisoning** — requires reviewing training/fine-tuning data pipelines, not applicable to most small businesses using a hosted model API directly
- **LLM06:2025 Excessive Agency** — requires reviewing what actions/tools/permissions the AI feature actually has (e.g. can it issue refunds, send emails, modify orders?) — a design review, not a black-box test
- **LLM08:2025 Vector and Embedding Weaknesses** — only relevant if the client uses retrieval-augmented generation (RAG) with a vector database; requires reviewing access controls on that store
- **LLM09:2025 Misinformation** — requires domain-expert review of output accuracy, not a security test per se

## Framing this honestly to clients

- This tests **your application's handling of AI input/output**, not the underlying model provider (e.g. Anthropic, OpenAI) — those companies have their own safety measures; this service is about your specific integration.
- The prompt-leakage check is a heuristic (pattern match), not proof — flag matches for manual confirmation rather than reporting them as certain findings.
- No LLM security review can guarantee a model will never be manipulated — the goal is defense-in-depth (input handling, output validation, rate limits, least-privilege tool access) rather than a claim of "unbreakable."

## Legal & ethical guardrails

- Written authorization before any testing, every time.
- Every test is an ordinary HTTP request with a text message — the same kind of request a real user's browser sends — never an attempt to compromise the underlying model provider's infrastructure.
- Test prompts used are standard, publicly-documented patterns from OWASP's own guidance, not novel jailbreak research.

## Suggested starting price point

- A flat fee for the automated pass + manual review of the non-black-box-testable categories relevant to the client's specific AI feature + written report.

## Sources

- OWASP Top 10 for LLM Applications (2025 edition, v2.0), OWASP GenAI Security Project
