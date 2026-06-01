# Deploying BitCraft Claim Monitor to an Ubuntu VPS

This guide is for the Hostworld Ubuntu VPS configuration with no control panel. The deployed app uses:

- Node.js 24 to run the application and SQLite API
- Caddy to provide the public HTTPS website
- systemd to keep the app running after restarts
- SQLite data stored outside the Git checkout at `/var/lib/bitcraft-claim-monitor`

The app server now serves the compiled frontend, the local history/admin API, and the restricted BitJita API proxy. In production it records settlement, market, and activity snapshots from BitJita every 30 seconds, even when no browser is open. Caddy only exposes it securely through your domain.

## Before You Begin

You need:

- An Ubuntu 22.04 VPS with its public IP address
- A domain or subdomain, for example `app.timbersteeltrace.com`, with an `A` DNS record pointing at that IP
- Your GitHub repository URL: `https://github.com/Red463/bitcraft-claim-monitor.git`

The server must run Node.js 24 or newer because the database uses Node's built-in SQLite support.

## 1. Connect and Secure the Server

Hostworld will provide the server IP address and the initial login details. Connect from Windows PowerShell:

```powershell
ssh root@YOUR_SERVER_IP
```

On the VPS, update packages and allow SSH and web traffic through the firewall:

```bash
apt update
apt upgrade -y
apt install -y git curl sqlite3 ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## 2. Install Node.js 24 and pnpm

Install Node.js 24 using the NodeSource Ubuntu repository, then enable the package manager version recorded by this project:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node --version
corepack enable
corepack prepare pnpm@11.1.3 --activate
```

The `node --version` output must begin with `v24.` or a later version.

References: <https://deb.nodesource.com/> and <https://nodejs.org/api/sqlite.html>

## 3. Install Caddy

Install the official Caddy Ubuntu package:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
caddy version
```

Source: <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>

## 4. Install the Application

Create an unprivileged service account, clone the project, create the database directory, install dependencies, and build the frontend:

```bash
useradd --system --home /opt/bitcraft-claim-monitor --shell /usr/sbin/nologin bitcraft
git clone https://github.com/Red463/bitcraft-claim-monitor.git /opt/bitcraft-claim-monitor
chown -R bitcraft:bitcraft /opt/bitcraft-claim-monitor
install -d -o bitcraft -g bitcraft -m 700 /var/lib/bitcraft-claim-monitor
cd /opt/bitcraft-claim-monitor
sudo -u bitcraft corepack pnpm install --frozen-lockfile
sudo -u bitcraft corepack pnpm --filter @workspace/bitcraft-local run build
```

## 5. Start the Application Service

The first production admin account is protected by a one-time server setup key. Create one and keep the printed value ready for the first Admin page login:

```bash
SETUP_KEY=$(openssl rand -hex 32)
printf 'ADMIN_SETUP_KEY=%s\n' "$SETUP_KEY" > /etc/bitcraft-claim-monitor.env
chmod 600 /etc/bitcraft-claim-monitor.env
echo "$SETUP_KEY"
```

Install the checked-in systemd service:

```bash
cp /opt/bitcraft-claim-monitor/deploy/bitcraft-claim-monitor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bitcraft-claim-monitor
systemctl status bitcraft-claim-monitor
curl http://127.0.0.1:18430/api/local/health
```

The final command should return JSON containing `"ok":true` and polling status. Within about 30 seconds, `polling.lastSuccessAt` should contain a timestamp.

## 6. Publish the Website With HTTPS

The checked-in Caddy example uses `app.timbersteeltrace.com` as the canonical domain and redirects `claim.timbersteeltrace.com` and the previous `claim.hostred.co.uk` host to it. If you use different hostnames, edit them before reloading Caddy:

```bash
cp /opt/bitcraft-claim-monitor/deploy/Caddyfile.example /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Open `https://app.timbersteeltrace.com/` in your browser. Caddy automatically obtains and renews the HTTPS certificate when DNS is pointing at the VPS and ports 80 and 443 are open.

Go to the app's **Admin** page. Enter the server setup key printed above and create your admin password. Once this succeeds, remove the one-time setup key from the running service:

```bash
rm /etc/bitcraft-claim-monitor.env
systemctl restart bitcraft-claim-monitor
```

On a production installation, market/activity history is collected by the server every 30 seconds. Visitors do not write snapshots, and manually resolving uncertain market events remains an admin-only action.

## Updating the App

After new changes have been pushed to GitHub, run:

```bash
cd /opt/bitcraft-claim-monitor
sudo -u bitcraft git pull --ff-only
sudo -u bitcraft corepack pnpm install --frozen-lockfile
sudo -u bitcraft corepack pnpm --filter @workspace/bitcraft-local run build
systemctl restart bitcraft-claim-monitor
systemctl status bitcraft-claim-monitor
```

Persistent application data is stored at `/var/lib/bitcraft-claim-monitor`, so updating application code does not replace history, admin configuration, uploaded branding or admin-created backups.

A new VPS begins with a new database. Activity history begins when it starts collecting snapshots, but Market Analytics now backfills available completed sell orders identified by BitJita as belonging to the monitored settlement market during the first successful collection.

After upgrading to `0.3.1-beta.1`, existing browser admin sessions expire because the server session lookup hash was changed. Sign in again on the Admin page; stored accounts and data are unchanged.

## Database Backups

Hostworld weekly VPS backups are useful, but keep a separate SQLite backup because this database records market and activity history.

The Admin console can create and download timestamped SQLite backups. These are written to `/var/lib/bitcraft-claim-monitor/backups`. Uploaded logos and favicons are stored in `/var/lib/bitcraft-claim-monitor/branding`; include that directory in any full-server backup if you use custom branding.

Create a protected backup directory:

```bash
install -d -o bitcraft -g bitcraft -m 700 /var/backups/bitcraft-claim-monitor
```

Create a backup at any time:

```bash
sudo -u bitcraft sqlite3 /var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite ".backup '/var/backups/bitcraft-claim-monitor/bitcraft-local.sqlite'"
```

To keep dated backups, use:

```bash
sudo -u bitcraft sqlite3 /var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite ".backup '/var/backups/bitcraft-claim-monitor/bitcraft-local-$(date +%F).sqlite'"
```

Periodically download a backup off the VPS to your computer:

```powershell
scp root@YOUR_SERVER_IP:/var/backups/bitcraft-claim-monitor/bitcraft-local.sqlite .
```

## Useful Checks

```bash
systemctl status bitcraft-claim-monitor
journalctl -u bitcraft-claim-monitor -n 100 --no-pager
systemctl status caddy
journalctl -u caddy -n 100 --no-pager
curl http://127.0.0.1:18430/api/local/health
```

Only Caddy should be exposed publicly. The Node app intentionally listens on `127.0.0.1`, so the SQLite/admin API is reachable through the HTTPS website but not directly through an open server port.
