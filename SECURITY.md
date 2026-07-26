# Security Policy

## Supported version

Only the current `main` source tree is supported. Deploy the latest validated version and rotate `DNS_PANEL_SESSION_SECRET` if session-signing material may have been exposed.

## Security properties

- DNSHE credentials, panel passwords, and session-signing secrets remain server-side Cloudflare secrets.
- The browser receives only signed HttpOnly session cookies and a per-session CSRF value held in module memory.
- Mutating API calls require a same-session CSRF token. The Pages middleware applies CSP and standard anti-framing/content-sniffing headers.
- Debug logging is disabled unless `DEBUG=true`; the logger redacts credentials, cookies, DNS content, and infrastructure IDs.
- The in-memory login rate limiter is best effort for one isolate. Configure Cloudflare Access, WAF rules, and rate limiting for public deployments.

## Reporting a vulnerability

Do not open public issues containing credentials, DNS records, API keys, or exploit details. Report the issue privately to the repository owner with reproduction steps, impact, and suggested remediation. Allow reasonable time for triage before public disclosure.

## Operational guidance

Use unique long panel passwords and an independently generated session secret (32+ characters). Restrict DNSHE API keys by IP where appropriate. Use a non-production DNSHE account to test record mutations and permanent upgrades. API secrets produced by create/regenerate are one-time values; store them in an approved secret manager immediately.
