# Production setup you control

## Domain, VPS and DNS

1. Buy a domain or choose a subdomain of a domain you already control.
2. Create an Ubuntu 24.04 LTS x86-64 VPS with a public IPv4 address. Enable its provider firewall for TCP 22, 80 and 443. Follow [VPS setup](DEPLOY.md#1-prepare-the-vps).
3. In the DNS provider, create an A record for the site hostname with the VPS IPv4 address. Add an AAAA record only when public IPv6 works. If your DNS provider has a proxy toggle, start with DNS-only for this setup. Check the result with `dig +short sotovor.example.com A` and, if used, `dig +short sotovor.example.com AAAA`.

## Verification email

1. Create an account with an SMTP provider and verify your sending domain or sender. Add the SPF and DKIM DNS records the provider supplies.
2. Create SMTP credentials for sending mail. Confirm the VPS can connect outbound to the provider on 587 or 465.
3. Put the host, port, username, password and verified sender into the VPS's `/opt/sotovor/.env`. Keep those credentials out of GitHub and chat. Register using an inbox you control to verify end-to-end delivery.

## GitHub Actions

1. On your workstation, generate a dedicated automation key: `ssh-keygen -t ed25519 -N '' -C sotovor-deploy -f ~/.ssh/sotovor-deploy`.
2. Append the contents of `~/.ssh/sotovor-deploy.pub` to the VPS user's `~/.ssh/authorized_keys`. Verify login with `ssh -i ~/.ssh/sotovor-deploy -o IdentitiesOnly=yes sotovor@YOUR_VPS_IP`.
3. From the VPS console, get the SSH host public key with `cat /etc/ssh/ssh_host_ed25519_key.pub`. From your workstation run `ssh-keyscan -t ed25519 YOUR_VPS_IP` and verify its key matches the console value. Copy the entire matching `known_hosts` line, including the hostname or IP.
4. In GitHub repository settings under **Environments**, create `production`. Add environment secrets `DEPLOY_HOST` (the same IP or hostname as in the host-key line), `DEPLOY_USER` (normally `sotovor`), `DEPLOY_SSH_KEY` (the private key file contents), and `DEPLOY_KNOWN_HOSTS` (the verified host-key line). If environment secrets are unavailable for your plan, put the same names in **Secrets and variables → Actions** as repository secrets. If your plan and repo visibility support required reviewers, configure them on `production` for manual approval. [GitHub deployment environments](https://docs.github.com/actions/deployment/targeting-different-environments/managing-environments-for-deployment)
5. Under **Secrets and variables → Actions**, confirm the existing repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` have permission to publish to `gasperkoprivc/sotovor`. If the image is private, also sign the VPS into Docker Hub with a separate pull-only token as the deployment user.
6. After the first manual setup works, create the repository **variable** `DEPLOY_ENABLED` with value `true`. On the next push to `main`, watch **CI** and then **Deploy production** in Actions. If using required reviewers, approve that run in GitHub. Remove the variable to pause automatic VPS deploys while retaining image publishing.
7. Set up the daily cron job from the deployment guide, take a first backup and test restoring it. Keep an encrypted copy outside the VPS.

## Android App Links and Firebase

1. Create a Firebase project and add an Android app with package `si.sotovor.app`. Add the SHA-1 and SHA-256 fingerprints from your debug and release signing certificates. If you use Play App Signing, include Google's app-signing fingerprints.
2. Download `google-services.json` to `apps/android/app/google-services.json`. Keep it out of commits. To build the optional Firebase debug APK in CI, add the base64-encoded file to the GitHub Actions secret `GOOGLE_SERVICES_JSON_BASE64`.
3. Generate a service-account credential with FCM send access. For Docker Compose, store its one-line JSON as a single-quoted value of `SOTOVOR_FCM_SERVICE_ACCOUNT_JSON` in the VPS `.env`. For a direct Node deployment, `SOTOVOR_FCM_SERVICE_ACCOUNT_FILE` can point to a private mounted JSON file.
4. Set `SOTOVOR_ANDROID_FINGERPRINTS` to the comma-separated SHA-256 signing fingerprints. Verify that `https://YOUR_DOMAIN/.well-known/assetlinks.json` returns the package name and fingerprints over HTTPS.
