# Legal review brief: Alux Plaza data protection

Prepared 10 October 2026 for a Kenyan data-protection lawyer. It states what the platform does, what has already been built, and the questions that need a legal answer, not a technical one. It is not legal advice, and nothing here has been reviewed by a lawyer yet.

## 1. What Alux Plaza is

A cybersecurity consultancy for small and medium businesses in Kenya and East Africa, run by one person from Nairobi. The website has a contact form and client accounts. Clients sign in to see compliance checklists and risk scores. Staff have an admin area that includes tools for running security audits against a target.

## 2. What the system does with personal data

| Area               | What happens                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contact form       | Collects name, email, optional company, message, and the time the sender ticked a consent box. A notification email with the same content is sent to the owner.                      |
| Client accounts    | Company name, email, password (hashed), sign-up consent time. Clients can sign up themselves or be created by the owner (no consent recorded for those).                             |
| Engagement records | Compliance checklist status and free-text notes per client, risk scores, share links that publicly show the company name.                                                            |
| Security records   | IP address, browser and result of every sign-in attempt, active sessions, security alerts to the owner, blocked IP addresses.                                                        |
| Staff action log   | Records which staff member did what and when.                                                                                                                                        |
| Service providers  | Vercel (website), Render (application server), Neon (database), Resend (email), Sentry (error reports), Discord (alerts), Google Fonts. See section 5 for what is still unconfirmed. |
| Cookies            | A sign-in cookie, a CSRF security cookie, and a display-theme setting kept on the visitor's device. No analytics or advertising.                                                     |

## 3. What has already been built

- **Consent boxes** on the contact form and client signup, linked to the privacy policy. The exact wording is quoted in section 6.
- **A rewritten privacy policy** covering what is collected, why, which providers receive it, transfers abroad and their risks, cookies, retention, rights, response times and how to complain to the Data Commissioner.
- **Tools for access and erasure requests**: export everything held about a person by email address, or erase it (a dry run first). Client accounts are anonymised, not deleted, so compliance records survive without a name. A written procedure sets the deadlines from the General Regulations (access 7 days, erasure 14).
- **Automatic retention**: a daily job that deletes data past the periods in section 4. It reports only, and deletes nothing, until the owner switches it on.
- **A "close account" action** that ends a client's access and starts the closed-account retention clock (built and tested, not yet merged).

## 4. Proposed retention periods

| Data                                           | Proposed period                               |
| ---------------------------------------------- | --------------------------------------------- |
| Contact form messages                          | 12 months after the enquiry was last updated  |
| Client accounts and engagement records         | 24 months after the account is closed         |
| Staff action log                               | 24 months                                     |
| Sign-in attempts (IP address, browser, result) | 90 days                                       |
| Blocked IP addresses                           | 7 days after the block ends                   |
| Queued emails                                  | 24 hours after they finish sending            |
| Database backups                               | Set by the database provider; not yet decided |

These are the owner's proposals. No lawyer has checked them.

## 5. Facts the owner must confirm before sending this

I could not verify these from the code. Please fill them in:

- [ ] Neon hosts the production database (the README says Render with Neon).
- [ ] Discord is the channel that receives security alerts (the code also supports Slack).
- [ ] The region configured for each of Vercel, Render, Neon, Resend and Sentry.
- [ ] Whether data-processing terms exist with each provider, and whether they were accepted.
- [ ] Annual turnover and number of employees, and the legal entity that runs Alux Plaza (sole proprietor, company, other).
- [ ] How long Neon keeps database backups on your plan.

## 6. Questions for the lawyer

For each question, "Our assumption" is what the current build does, so the lawyer can say where it is wrong.

1. **Lawful basis and consent.** Regulation 5(2) says one legal basis per purpose. Regulation 4(4)(b) says consent is not freely given if it is a non-negotiable part of the terms, and 4(4)(c) if the person cannot refuse without detriment. Both forms require ticking the box to proceed.
   - Contact form wording: "I agree that Alux Plaza may use the details I provide here to respond to my enquiry, as described in the Privacy Policy. I can withdraw this at any time by emailing privacy@aluxplaza.com."
   - Signup wording: "I agree that Alux Plaza may use the details I provide to create and manage my account, as described in the Privacy Policy. I can withdraw this at any time by emailing privacy@aluxplaza.com."
   - Our assumption: consent. Should client accounts rest on a contract basis instead, with an acknowledgement of the notice in place of consent? What basis fits the contact form, the security logging, and the staff action log?

2. **Retention periods.** Are the periods in section 4 defensible? Do limitation periods, tax or accounting rules, or professional-record duties require us to keep client engagement records (24 months after closure), or anything else, for longer? Is 90 days enough for security logs, and is there a reason to keep them longer?

3. **Transfers outside Kenya.** All the providers in section 2 appear to process data outside Kenya. Which basis under regulations 40 to 48 should we rely on: safeguards, adequacy, necessity or consent? Are the providers' standard data-processing terms enough for regulation 24? What must we document under regulation 41(2), and who keeps it? Regulation 26 requires some processing to stay in Kenya, including processing for a "protected computer system" under the Computer Misuse and Cybercrime Act. Could any client of a security consultancy fall under that?

4. **Controller or processor.** When we run a security audit against a client's website or systems, does the platform process personal data on the client's behalf? If so, what do we need: a processing agreement template, a change to the policy, a different retention rule? (We have not assessed whether audit results contain personal data.)

5. **Registration with the Data Commissioner.** Secondary sources say a controller with annual turnover under KES 5 million and fewer than 10 employees is exempt from mandatory registration, unless it processes personal data for a listed purpose or in a listed sector (for example education, health, financial services). The ODPC publishes a guidance note on this. Is Alux Plaza exempt, and does any of its activity count as a listed purpose? Does the exemption affect any other duty?

6. **The privacy policy text.** Does it satisfy regulation 4(1) (notice content) and regulation 23 (published policy)? Is the wording acceptable on: the transfer risks, the right to withdraw, what happens if consent is withheld, the response times we commit to, and the grounds on which we may refuse erasure under regulation 12(4)?

7. **Handling requests.** Is the written procedure sound on identity checks (we reply only to the address on file), refusal wording, and the free-of-charge rule? For a security consultancy, which erasure refusals are safe to rely on (security logs, an open dispute, a legal claim)?

8. **Breach notification.** Is the plan to notify the Data Commissioner within 72 hours and the plan for notifying affected clients adequate? We have not yet written the procedure; what should it contain beyond the content list in regulation 38(1)?

9. **Anything missing.** Do we need a data protection impact assessment for the audit tools or the compliance records (regulation 49)? Anything on children's data, cookies, or the fonts loaded from Google that the policy should say?

## 7. What to send the lawyer

- The rendered privacy policy page (source: `frontend/src/pages/PrivacyPolicy.tsx`).
- `docs/DATA_SUBJECT_REQUESTS.md` (the request procedure).
- `docs/COMPLIANCE_MAPPING.md` (a technical status against the Act and Regulations, with its own list of open items).
- The two consent wordings in section 6, question 1.
- The completed checklist in section 5.
