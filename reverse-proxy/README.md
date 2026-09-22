# Personal reverse proxy

Reusable Caddy reverse proxy for `nicolaspiquion.fr` and future personal projects.

## Local Docker Desktop

1. Copy `.env.example` to `.env`.
2. Start DropVault on the host with `npm start`.
3. Run `docker compose up -d` from this folder.
4. For a local-only check, use `http://localhost/dropvault/`.

The default upstream `host.docker.internal:8080` is for Docker Desktop. Caddy strips `/dropvault` before sending the request to DropVault.

## VPS / Portainer

Set these values in the Stack environment:

```env
ACME_EMAIL=you@example.com
DROPVAULT_UPSTREAM=dropvault:8080
```

Deploy the proxy and attach the DropVault service to the same external Docker network named `proxy`. Your DNS `A` record for `nicolaspiquion.fr` must point to the VPS. Caddy will request and renew the HTTPS certificate automatically.

To add another project, add another `handle_path` block or a subdomain block to `Caddyfile`, then reload the proxy:

```sh
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Back up the `caddy_data` volume: it contains Caddy's certificate state.
