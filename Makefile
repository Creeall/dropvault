SHELL := /bin/sh

APP_COMPOSE := docker compose
PROXY_COMPOSE := docker compose -f reverse-proxy/docker-compose.yml

.PHONY: help up down rebuild refresh logs proxy-up proxy-down proxy-rebuild proxy-reload proxy-logs all-up all-down all-rebuild

help:
	@echo "DropVault commands"
	@echo "  make up            Start/rebuild DropVault"
	@echo "  make rebuild       Rebuild DropVault and recreate its container"
	@echo "  make refresh       Recreate DropVault after .env changes"
	@echo "  make down          Stop DropVault"
	@echo "  make logs          Follow DropVault logs"
	@echo "  make proxy-up      Start the reusable Caddy proxy"
	@echo "  make proxy-rebuild Recreate the Caddy proxy"
	@echo "  make proxy-reload  Reload Caddyfile without recreating"
	@echo "  make proxy-down    Stop the reusable Caddy proxy"
	@echo "  make proxy-logs    Follow Caddy logs"
	@echo "  make all-up        Start proxy and DropVault"
	@echo "  make all-rebuild   Recreate proxy and rebuild DropVault"
	@echo "  make all-down      Stop proxy and DropVault"

up:
	$(APP_COMPOSE) up -d --build

rebuild:
	$(APP_COMPOSE) up -d --build --force-recreate

refresh:
	$(APP_COMPOSE) up -d --force-recreate

down:
	$(APP_COMPOSE) down

logs:
	$(APP_COMPOSE) logs -f dropvault

proxy-up:
	$(PROXY_COMPOSE) up -d

proxy-rebuild:
	$(PROXY_COMPOSE) up -d --force-recreate

proxy-reload:
	$(PROXY_COMPOSE) exec caddy caddy reload --config /etc/caddy/Caddyfile

proxy-down:
	$(PROXY_COMPOSE) down

proxy-logs:
	$(PROXY_COMPOSE) logs -f caddy

all-up: proxy-up up

all-rebuild: proxy-rebuild rebuild

all-down: down proxy-down
