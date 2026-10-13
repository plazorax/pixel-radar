# Deployment

pixel-radar is a single Node.js process: it serves the built dashboard, the API and the
screenshots, and can run scheduled checks.

## Requirements

- Node.js 20.19+ or 22.12+
- Chromium for Playwright. On Linux, install its system libraries too:

```sh
npx playwright install --with-deps chromium
```

## Steps

```sh
git clone https://github.com/plazorax/pixel-radar.git
cd pixel-radar
npm ci
npx playwright install --with-deps chromium
npm run build                      # builds the dashboard into dist/web
cp sites.example.json sites.json   # then edit
cp .env.example .env               # set PIXEL_RADAR_PASSWORD and PIXEL_RADAR_SESSION_SECRET
npm start
```

## Network and security

- The server binds to `127.0.0.1` by default. Put it behind a reverse proxy (nginx, Caddy) with
  HTTPS, or set `HOST=0.0.0.0` only on a trusted network.
- Always set `PIXEL_RADAR_PASSWORD` when the dashboard is reachable by anyone else. Without it,
  every visitor can trigger captures and replace baselines; the server prints a warning at startup.
- Set `PIXEL_RADAR_SESSION_SECRET` so logins survive restarts. Changing the password logs every
  session out.
- The session cookie is `HttpOnly` and `SameSite=Lax`; it is marked `Secure` when Express sees an
  HTTPS request. Behind a proxy that terminates TLS, set `TRUST_PROXY` (for example `TRUST_PROXY=1`
  for one proxy hop, or `loopback`) so Express trusts its `X-Forwarded-Proto` header.
- Failed logins are delayed by one second, but there is no lockout: use a long random password.
- Browser `POST` requests to the API that another site initiated (`Sec-Fetch-Site: cross-site` or
  `same-site`) are refused, so a web page cannot trigger captures or replace baselines through
  your browser, even when login is disabled.
- Screenshots are served only to logged-in users, and only from the screenshots folder.

## Fetching arbitrary URLs

Loading the configured URLs in a real browser is the whole point, so treat the config as
privileged: anyone who can edit `sites.json` can make the server open any address it can reach,
including `localhost`, cloud metadata endpoints and intranet hosts, and then view the result as a
screenshot. A monitored public page can also redirect or embed such addresses. The HTTP API cannot
add or change URLs, but keep the config file writable only by trusted users, and run the service
in a container or network segment without access to sensitive internal services.

## Keeping it running

Any process manager works. A minimal systemd unit:

```ini
[Unit]
Description=pixel-radar
After=network.target

[Service]
WorkingDirectory=/opt/pixel-radar
ExecStart=/usr/bin/npm start
Restart=on-failure
User=pixelradar

[Install]
WantedBy=multi-user.target
```

Back up `storageDir` (baselines and `state.json`) if the baselines matter to you.

## HTTP API

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check, no login needed. |
| `GET /api/session` | Whether login is required and whether the caller is logged in. |
| `POST /api/login` | `{ "password": "..." }`; sets the session cookie. |
| `POST /api/logout` | Clears the session cookie. |
| `GET /api/sites` | Groups, sites, viewports, statuses and image URLs. |
| `POST /api/sites/:id/check` | Check one site; also `/rebase` and `/accept`. Returns the updated site. 409 if it is already running. |
| `GET /screenshots/:id/:viewport/{baseline,current,diff}.png` | Images. |

Scripts can authenticate with `Authorization: Bearer <password>` instead of the cookie.
Action requests can take as long as the capture (page load timeout times retries), so give the
reverse proxy a generous read timeout.
