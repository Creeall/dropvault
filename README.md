# DropVault

Self-hosted, expiring file sharing for personal use. Upload files up to 3 GB, create 7-day or 30-day links, renew links, replace the app data volume, and log downloads. Optional SMTP notifications are sent when a public link is downloaded.

## Run with Docker Desktop

1. Copy `.env.example` to `.env`, set a strong `ADMIN_PASSWORD`, and set `PUBLIC_BASE_URL=https://nicolaspiquion.fr/dropvault` for production (use `http://localhost:8080` locally).
2. Run `docker compose up --build`.
3. Open [http://localhost:8080](http://localhost:8080).

The `dropvault_data` volume stores uploaded files and metadata. Back it up before moving the app to a VPS. Admin sessions are held in memory and expire when the container restarts.

For `nicolaspiquion.fr/dropvault`, configure the proxy to redirect `/dropvault` to `/dropvault/`, then forward `/dropvault/` to `http://dropvault:8080/` with the `/dropvault` prefix removed. The app's generated links will be `https://nicolaspiquion.fr/dropvault/s/<token>`.

A reusable Caddy reverse-proxy stack is included in [`reverse-proxy/`](reverse-proxy/README.md). It can route this app and future projects from one place.

## Portainer

Create a new Stack from this folder or paste `docker-compose.yml`. Set the environment variables in the Stack UI, especially `PUBLIC_BASE_URL=https://nicolaspiquion.fr/dropvault` and the SMTP values. Put the service behind your reverse proxy (Caddy, Traefik, or Nginx) for HTTPS, routing `/dropvault` to the container and stripping that prefix before forwarding.

## Notes

The current admin surface is intentionally single-user and local/private. Add a reverse-proxy password or VPN before exposing it publicly. For larger teams or multi-user auth, replace the simple JSON metadata store with SQLite/Postgres and add an authentication layer.
