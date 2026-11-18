# Deploy Sotovor on one Ubuntu VPS

These commands target an Ubuntu 24.04 LTS x86-64 VPS with a public IP, a domain you control, and an authenticated SMTP account. Caddy obtains and renews HTTPS certificates. Caddy is the only container with published ports. MongoDB uses a named volume on an internal network and requires authentication. The app's database user has `readWrite` on the Sotovor database only. [MongoDB official image](https://hub.docker.com/_/mongo) · [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)

See [human setup tasks](HUMAN_TASKS.md) for the domain, DNS, SMTP, and GitHub settings.

## 1. Prepare the VPS

SSH to the address in your VPS dashboard with the provider's initial administrator account. Run these commands from that session.

```bash
sudo adduser sotovor
sudo usermod -aG sudo sotovor
sudo install -d -m 700 -o sotovor -g sotovor /home/sotovor/.ssh
# Run this if the initial account already has your administrator's public key.
sudo install -m 600 -o sotovor -g sotovor "$HOME/.ssh/authorized_keys" /home/sotovor/.ssh/authorized_keys
sudo install -d -m 750 -o sotovor -g sotovor /opt/sotovor

sudo apt-get update
sudo apt-get install -y ca-certificates curl openssl ufw cron
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
sudo systemctl enable --now cron
```

Test `ssh sotovor@YOUR_VPS_IP` in a second terminal before closing the first session. If the first account had no `authorized_keys` file, add your own administrator **public** key to the new user's file before testing. Allow the same three TCP ports in the VPS provider's firewall. Docker manages rules for published ports, so also check the Compose port list when changing services. [Docker and firewall considerations](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations)

## 2. Install Docker Engine and Compose

Run on the VPS as `sotovor`.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf '%s\n' "Types: deb" "URIs: https://download.docker.com/linux/ubuntu" \
  "Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}" "Components: stable" \
  "Architectures: $(dpkg --print-architecture)" "Signed-By: /etc/apt/keyrings/docker.asc" |
  sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker sotovor
exit
```

Reconnect and run `docker compose version`. The `docker` group has root-equivalent access, so give SSH access for this account only to trusted operators and the private deployment key. [Docker Engine for Ubuntu](https://docs.docker.com/engine/install/ubuntu/) · [Docker Linux post-installation](https://docs.docker.com/engine/install/linux-postinstall/)

## 3. Upload the release and configure it

On your workstation in a Bash shell with a Sotovor checkout, wait for the **Deploy production** workflow to publish the image for `main`. Copy the files from that same revision. This works for a private GitHub repo without giving the VPS repository credentials.

```bash
git fetch origin main
release=$(git rev-parse origin/main)
git archive "$release" compose.prod.yaml Caddyfile .env.production.example deploy scripts |
  ssh sotovor@YOUR_VPS_IP 'cd /opt/sotovor && tar -xf -'
printf 'Published image to use: gasperkoprivc/sotovor:sha-%s\n' "$release"
```

On the VPS:

```bash
cd /opt/sotovor
install -m 600 .env.production.example .env
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

Set `SOTOVOR_DOMAIN` to your site hostname, for example `sotovor.example.com`. Set `SOTOVOR_IMAGE` to the full SHA tag printed above and paste a different generated value into each of the two MongoDB password fields. Set the SMTP host, port, user, password and verified sender. For values that contain `$`, use single quotes in `.env` to keep the value literal. The SMTP connection uses STARTTLS on port 587 or implicit TLS on 465. The Mongo application password must be URL-safe as shown in the example.

Point the DNS A record for the hostname at the VPS. Add an AAAA record only if IPv6 is configured and 80 and 443 are reachable over IPv6. Once DNS resolves, run:

```bash
cd /opt/sotovor
bash scripts/prod-compose.sh config --quiet
bash scripts/prod-compose.sh pull
bash scripts/prod-compose.sh up -d --wait --wait-timeout 180
bash scripts/prod-compose.sh ps
```

The script runs Docker Compose with `compose.prod.yaml` and `.env` from this project. It also reads `.release.env` once automated deployment writes it. DNS must resolve publicly and Caddy must be reachable on 80 and 443 for the public certificate. MongoDB init credentials apply only on an empty volume. Changing `.env` alone later does not rotate an existing database password.

## 4. Verify the public site

From a machine outside the VPS, replace the hostname and run:

```bash
curl -I https://sotovor.example.com/healthz
curl -fsS https://sotovor.example.com/readyz
curl -fsS https://sotovor.example.com/ >/dev/null
```

Expect HTTP 200 and `{"status":"ready"}`. On the VPS, `bash scripts/prod-compose.sh ps` should list host port mappings only for Caddy. From outside, `nc -vz -w 5 YOUR_VPS_IP 27017` should fail.

In a browser open the HTTPS URL and register with an inbox you control. Open the verification link, click **Verify email address**, and return to Sotovor. If the email does not arrive, check spam, SMTP provider delivery logs and the app logs, and retry **Resend verification link** after one minute. Existing accounts can sign in and request a link from their profile. In a family space, open **Add entry**, allow microphone access, record a short voice note, save, and play it back. Browser policy and Caddy's permissions header allow the microphone on the site's own secure origin.

## 5. Daily backup and restore

As `sotovor` on the VPS:

```bash
cd /opt/sotovor
install -d -m 700 "$HOME/backups"
SOTOVOR_BACKUP_DIR="$HOME/backups" bash scripts/backup.sh
crontab -e
```

Add this daily job (02:15 in the VPS timezone):

```cron
15 2 * * * umask 077; SOTOVOR_BACKUP_DIR=/home/sotovor/backups SOTOVOR_BACKUP_RETENTION_DAYS=14 /bin/bash /opt/sotovor/scripts/backup.sh >> /home/sotovor/backups/backup.log 2>&1
```

The script writes a gzip-compressed, UTC-dated Mongo archive, checks it, then prunes matching archives older than the configured retention. The dump covers the application DB, including account and session data, but excludes cluster users and Caddy state. Keep copies encrypted off the VPS. With standalone MongoDB the live dump is not a point-in-time snapshot across collections. For a maintenance backup requiring no concurrent writes, stop `app`, take the dump, then start it again.

Test a restore on a separate deployment or during a maintenance window. For recovery on a fresh server, initialize MongoDB with the **same database name** and new credentials if needed. When restoring on a populated server, the restore stops the app and drops the collections present in the archive. Collections absent from the archive remain. Take a separate backup first.

```bash
cd /opt/sotovor
bash scripts/prod-compose.sh up -d --wait mongo
bash scripts/restore.sh --replace /home/sotovor/backups/sotovor-REPLACE-WITH-ACTUAL-FILENAME.archive.gz
bash scripts/prod-compose.sh up -d --wait --wait-timeout 180
bash scripts/smoke-prod.sh https://sotovor.example.com
```

Check family data after restoring, and leave the app stopped if the restore reports an error until you can inspect and retry it. CI runs `bash scripts/test-prod.sh` through a disposable Compose project, including HTTPS, MongoDB authentication and backup retention, and verifies that data and an index come back after a real restore. [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/)

## Updates, rollback and logs

Once [GitHub deployment is enabled](HUMAN_TASKS.md#github-actions), a successful `CI` run on a push to `main` publishes the Docker Hub image, uploads the Compose and script files, and pulls and starts the tested SHA over SSH. The deployment fails if the HTTPS readiness endpoint or landing page fails the smoke check. The workflow does not upload `.env` or overwrite backups. Deployments can briefly interrupt requests while containers restart.

For a manual update, upload the files for the desired published revision again as in step 3. Then run this on the VPS:

```bash
cd /opt/sotovor
bash scripts/deploy-prod.sh REPLACE_WITH_FULL_PUBLISHED_COMMIT_SHA
```

To roll back, select a known-good full SHA tag from Docker Hub. The preceding deployed override is saved to `.previous-release.env` if it existed. If the Compose files changed, also upload their previous versions as in step 3. Use `deploy-prod.sh` with the known-good SHA, then verify the site. An app rollback does not roll back the database.

```bash
cd /opt/sotovor
bash scripts/prod-compose.sh ps
bash scripts/prod-compose.sh logs --tail 100 app caddy mongo
bash scripts/prod-compose.sh logs -f --tail 30 app caddy
tail -n 50 "$HOME/backups/backup.log"
```

Optionally set up an external HTTPS monitor for `/readyz` and a notification for failed checks. This is particularly useful when MongoDB is unavailable while Caddy still answers HTTPS.

## Public downloads

The public page is `/prenesi`. Set `SOTOVOR_RELEASE_GITHUB_TOKEN` in the VPS `.env` to a read-only Contents token for the private release repository, then recreate the app container. `SOTOVOR_RELEASE_REPOSITORY` defaults to `GasperKoprivc/SOTOVOR`. `SOTOVOR_GOOGLE_PLAY_URL` is optional. The server caches GitHub's latest stable release for ten minutes and streams only installers and updater metadata intended for distribution.

During a GitHub outage, the server uses a cached release when available or reads `SOTOVOR_RELEASE_FALLBACK_JSON`. Set it to one line of single-quoted JSON in the VPS `.env`. Replace the illustrative URL, size and checksum with the mirror's real values. A direct Node deployment can use `SOTOVOR_RELEASE_FALLBACK_FILE` to read the same JSON from a file.

```json
{
  "version": "0.1.0",
  "publishedAt": "2026-11-18T12:00:00Z",
  "downloads": {
    "windows": {
      "url": "https://downloads.example.com/Sotovor-0.1.0-windows-x64-setup.exe",
      "size": 1048576,
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "signed": false
    }
  }
}
```

The releases workflow supplies the updater manifest, and fallback mirrors provide page downloads. Follow the [release setup](HUMAN_TASKS.md#publish-the-installers) before tagging.

## Alternative: managed container hosting and MongoDB Atlas

Deploy the same Docker Hub image to a managed web service with automatic HTTPS. Configure `SOTOVOR_HOST=0.0.0.0`, the provider's port as `SOTOVOR_PORT`, and `SOTOVOR_PUBLIC_URL` as the HTTPS origin. Set `SOTOVOR_TRUST_PROXY=1` only if exactly one trusted proxy sits in front of the app and it cannot be bypassed. Set `SOTOVOR_REQUIRE_SMTP=1` and all SMTP values from the production example. Set `SOTOVOR_MONGO_URI` to the Atlas connection string for a scoped database user, and `SOTOVOR_DB` to the application database. Allow Atlas traffic only from the service's egress addresses or a private connection. Configure Atlas backups separately and use `/readyz` as the health check. The VPS Compose backup scripts specifically target the local Mongo container. [MongoDB Atlas connection setup](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)
