# DNSHE Panel

> Panel version: **1.0.0** · Compatible with **DNSHE API V2.0**

A security-focused, multi-account DNSHE API V2.0 administration panel built with **Cloudflare Pages Functions** and native HTML, CSS, and browser ES modules. There is no frontend framework or generated frontend build output.

## Capabilities

- Signed `HttpOnly; Secure; SameSite=Strict` session cookies with per-session CSRF tokens.
- Global Pages middleware with a restrictive CSP, security headers, API authentication, and CSRF enforcement.
- Explicit multi-account selection from configured `DNSHE_KEY_<index>` / `DNSHE_SECRET_<index>` pairs. Aliases are display-only and never used as identifiers.
- Complete DNSHE V2 subdomain coverage: list with every documented filter/sort/field/pagination option, register, detail, delete, and renew.
- Complete DNS record management for A/AAAA/CNAME/MX/TXT/NS/SRV/CAA, including provider/internal IDs, resolution line, structured SRV/CAA fields, method variants, and record pagination.
- API key list/create/regenerate/delete, structured quota metrics, WHOIS public-first inspection with authenticated fallback, and permanent-upgrade requests/eligibility/assist logs.
- Validated mutations, structured error responses with request IDs, upstream 429 details, conservative pagination, and one-page-per-account aggregation.
- A responsive graphite/amber/olive dark operations UI with no blue or purple palette, native dialogs, mobile card tables, text-only rendering, visible focus states, and reduced-motion support.

## Configure secrets

Copy `.env.example` to `.dev.vars` for local development, or set these values as Cloudflare Pages secrets:

```sh
DNS_PANEL_PASSWORD='long unique panel password'
DNS_PANEL_SESSION_SECRET='at least 32 random characters; use a generated secret'
DNS_PANEL_SESSION_MAX_AGE_SECONDS='28800'
DNSHE_KEY_1='DNSHE key'
DNSHE_SECRET_1='DNSHE secret'
DNSHE_ALIAS_1='Primary account'
```

Add additional complete pairs as `DNSHE_KEY_2`, `DNSHE_SECRET_2`, and optional `DNSHE_ALIAS_2`. A key without a paired secret is deliberately ignored. Do not commit `.dev.vars`, credentials, cookies, or one-time API secrets.

For Pages deployment, use `wrangler pages secret put NAME` for each secret. The panel requires both session variables; authentication returns a configuration error when either is absent.

## Local development

```sh
npm install
cp .env.example .dev.vars
# replace all placeholder values in .dev.vars
npm run validate
npm run dev
```

`npm run dev` launches `wrangler pages dev public --port 8788`. The `Secure` cookie attribute is intentional; browser behavior for HTTP localhost can differ from production HTTPS Pages previews.

Without credentials, the safe local smoke check is:

```sh
curl -i http://localhost:8788/api/subdomains
# expected: 401 JSON response with a requestId
```

With a valid local `.dev.vars`, `POST /api/auth` should set a session cookie containing `HttpOnly`, `Secure`, and `SameSite=Strict`; a mutation without `X-CSRF-Token` should return `403`. Do not use production DNSHE accounts for destructive verification.

## Validation

```sh
npm run typecheck
npm run check:frontend
npm run check:security
npm test
npm run validate
```

The test suite uses mocked upstream responses; it never calls DNSHE. `npm run validate` combines all checks.

## Deployment

The repository declares `pages_build_output_dir = "public"` in `wrangler.toml`.

```sh
npm run deploy
# or: wrangler pages deploy public --project-name <your-pages-project>
```

Use Cloudflare Pages secrets, HTTPS, and preferably Cloudflare Access/WAF as defense in depth. The built-in login limiter is per-isolate best effort only; it is not a globally durable rate limiter.

## Security model and limits

All `/api/*` routes except authentication login require a valid signed session. Every unsafe authenticated method requires the session CSRF token and rejects cross-origin `Origin` headers. API responses use:

```json
{"success": true, "data": {}, "requestId": "..."}
```

or a structured error with `message`, `requestId`, optional `error_code`, `details`, and sanitized `upstream` metadata. The frontend renders upstream strings as text, does not use `innerHTML`, and never persists passwords or tokens in web storage.

Subdomain `accountIndex=all` is an aggregation of the selected page from each account; it is not globally sorted or a complete inventory. WHOIS defaults to DNSHE's documented public no-key mode, then retries with the selected account when the upstream requires API verification; users may also force authenticated mode. The panel route itself remains protected by the panel session so it cannot be used as an anonymous public proxy. DNSHE V2 response shapes for SRV/CAA and permanent upgrades should be verified using a non-production account before a live rollout. Permanent upgrade and API-key regeneration actions are quota-affecting or destructive and require confirmation in the UI. An API secret is displayed only in its immediate create/regenerate response; closing the dialog makes it unrecoverable through this panel.
