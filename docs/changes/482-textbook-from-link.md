# 482: Register a textbook from a Yes24 or Kyobo link

## What changed

- `POST /api/textbooks/from-link` (`backend/src/textbook-link.ts`, mounted before the textbook routes in `app.ts`): takes `{ url }`, fetches the store page on the server, sends a digest of it to Claude through `callClaude` (new feature name `textbook-link` in `claude-usage.ts`), validates the JSON answer with zod and returns `{ textbook: { title, author, edition } }`. Nothing is saved.
- SSRF guard: only `https` on `www.yes24.com`, `yes24.com`, `www.kyobobook.co.kr` and `product.kyobobook.co.kr`, no credentials, port 443 only. A link on any other host is refused with 400 before any request is made.
- Redirects are followed by hand (at most 3). Each `Location` goes through the same allow-list check before it is requested, so a redirect to another host or to http is refused.
- Caps: 10 seconds for the whole fetch, 1.5 MB of page (checked on `content-length` and while reading), HTML content types only. The digest sent to Claude is the title, the product meta tags, JSON-LD and the visible text, cut to about 12,000 characters, so one registration is one small call.
- The page text is untrusted: it is fenced in `<page>` tags (a closing tag inside is escaped) and the system prompt says to extract facts only.
- Failures map to messages through the shared `apiFailure`/`callClaude` path plus: 400 bad or foreign link, 413 page too large, 422 not a book page (empty title) or refusal, 502 page not readable or AI failure, 503/429 key or rate problems, 504 timeout. It shares the Claude concurrency gate (`claudeSlots`) and stops when the browser tab is closed.
- Frontend `textbooks.tsx`: a link field with a "Fill in" button on the Register form (not when editing), a loading state, Enter in the field reads the link and does not register. The answer fills the three fields; the person fixes them and presses Register.
- Test helper `backend/test/helpers.ts` gets `linkFetcher` and `linkReader` stand-ins that throw by default, like the other Claude stand-ins.
- OpenAPI and `docs/openapi.json` list the route.

## Store terms and robots check (2026-11-28)

- `robots.txt` of `www.yes24.com`: product pages (`/Product/Goods/<id>`) are not disallowed; the disallowed paths are `/Product/Base/`, review and module endpoints and similar. Kyobo (`www` and `product`): `Allow: /`, only `/api/gw` is disallowed (named AI user agents are allowed too).
- One page is read per registration, on a click by the person, with an ordinary browser-like `accept` header, no crawling and no storage of the page.
- A live probe with guessed product IDs was inconclusive (Yes24 redirected an unknown ID to its notice page, Kyobo answered an empty 200), so whether each store serves the metadata to a server request still needs one real link of each. That is a user task, sent to the coordinator.
- Fallback if a store blocks server requests or renders with JavaScript only: add a paste-the-page-text field to the same route. Not built now, to keep the card small.

## Tests

- `backend/test/textbook-link.test.ts` (no network, no Claude call): the allow-list (accepted and refused links, including look-alike hosts, http, credentials, ports, IPs), a redirect to another host is refused before it is requested, an in-store redirect is followed with a limit, too large / not HTML / error pages, the page digest, the reader (fenced input, cleaned fields, empty title, bad JSON, cut-off and refusal) and the route (fills without saving, foreign hosts make no request, failures map to their status).
- `frontend/src/textbook-link.test.tsx`: the link fills the form and sends one request, Enter does not register, a refused link keeps the form. `textbooks.test.tsx`: the field count includes the link field.
