# Production setup you control

## Sotovor Pro P1 operator testing

P1 is entitlements only: **no real payments, checkout, products or provider
webhooks exist yet**. The agreed consumer prices remain EUR 3/month or EUR
30/year, including VAT. Do not collect card details or enable a live payment
provider for this phase. Existing public-launch setup tasks below still apply.

1. Copy `.env.example` for local `start.bat`, or `.env.production.example` when
   setting up the VPS. Leave `SOTOVOR_BILLING_ENABLED=false` for a free launch
   or self-hosting; all features are unlocked and billing UI stays absent.
2. For an isolated test, set `SOTOVOR_BILLING_ENABLED=true` and
   `SOTOVOR_BILLING_PROVIDER=mock`, a local `SOTOVOR_PUBLIC_URL` and a random
   `SOTOVOR_BILLING_WEBHOOK_SECRET` (at least 16 characters), then restart the server. The provider does
   not contact a payment service. Examples list every `SOTOVOR_LIMIT_FREE_*`
   and `SOTOVOR_LIMIT_PRO_*` override. Integers or `unlimited` control counts;
   `true`/`false` control features. These defaults live in one policy file,
   `backend/src/entitlements.js`. Extra shopping-list limits are reserved until
   multi-list support exists.
3. Register an admin and another account, create a family and accept its invite.
   Inspect `GET /api/v1/spaces/<spaceId>/billing` using a normal authenticated
   browser or bearer API request. The non-admin must have
   `mayManageBilling=false`. POST `{}` to the matching `/billing/trial` path
   as admin; try again and verify `TRIAL_ALREADY_USED`. No payment card is involved.
4. Operators can grant or revoke a support/beta allowance from the project root:

   ```powershell
   $env:SOTOVOR_MONGO_URI = 'mongodb://127.0.0.1:27027'
   $env:SOTOVOR_DB = 'sotovor'
   $env:SOTOVOR_BILLING_OPERATOR = 'your-operator-name'
   node scripts/grant-pro.js <spaceId> 30 --reason 'Beta tester'
   node scripts/revoke-pro.js <spaceId> --reason 'Beta period finished'
   ```

   Use the database actually serving the app. On Linux set those environment
   variables with `export` instead. To load a private env file, set
   `SOTOVOR_ENV_FILE` to its absolute path. The scripts use the existing Node
   dependencies, validate the space/days/reason, and always close the DB client.
   They are operator tools, not HTTP routes; keep database credentials private.
   Revocation clears **only the manual allowance**, not a trial or future paid
   subscription. A grant sets an allowance from now; it does not buy a plan.

5. Confirm the audit records in `billing_audit` and test a downgraded space:
   existing members and audio remain usable, ordinary tasks still work and the
   account export contains retained family data. Never delete a family's data
   to simulate expiry.

## Sotovor Pro P2: Stripe setup

Follow [BILLING.md](BILLING.md) in **Stripe test mode first**. The owner must:

1. Create/verify the Stripe business account; choose the appropriate business
   identity and payout settings. Do not send secret keys through chat.
2. Create the agreed inclusive EUR 3/month and EUR 30/year recurring prices;
   put their IDs and `sk_test_...` in private environment settings. Exact CLI
   commands, all variable names and validation rules are in BILLING.md.
3. Configure Customer Portal invoice access, payment-method updates, cancellation
   at period end and only the two permitted price options. Configure provider
   receipts. Review tax registrations; only enable automatic tax after that review.
4. Use `stripe listen` locally, then register the public HTTPS webhook endpoint
   when a domain/VPS exist. Use the matching `whsec_...` secret and listed event
   types. Confirm signing, duplicate deliveries and reconciliation in test mode.
5. Review withdrawal/immediate-service consent, recurring terms, refunds,
   privacy, business/contact details and invoice/tax obligations with a qualified
   human. Supply reviewed UTF-8 `legal/pogoji.txt`; for Compose set the container
   path `/app/legal/pogoji.txt`. The default `/pogoji` copy is a testing draft,
   not approved terms. Stripe live keys fail startup without reviewed-file
   configuration and HTTPS; a file's presence does not substitute for review.
6. Verify actual SMTP delivery of welcome, payment-failed and ends-soon mail
   in the user's language, the portal link, backups and restore. Complete the
   manual test checklist before separately enabling live mode. No real charges
   or public deployment were performed by this phase.
7. Leave provider choice as Stripe unless separately deciding on a Merchant
   of Record. Paddle/P2b is optional and not implemented. Turning the billing
   flag off does not cancel existing provider renewals; cancel/migrate them
   deliberately before disabling a paying installation.

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

## Publish the installers

1. Deploy the current `main` to your HTTPS site. Set the GitHub Actions repository variable `SOTOVOR_PRODUCTION_URL` to that origin, without a path. Both installers use it to sign in.
2. Create a fine-grained GitHub token scoped to the private Sotovor repo with **Contents: Read-only**. Set it on the VPS as `SOTOVOR_RELEASE_GITHUB_TOKEN` and recreate the app container. The site serves approved installers anonymously through your domain. Keep the token on the server.
3. Configure Android signing below. To include push, add the matching production `google-services.json` as the base64 secret `ANDROID_GOOGLE_SERVICES_BASE64`, and configure the server's Firebase credentials and signing fingerprints. The debug CI secret is separate.
4. In GitHub Actions, use **Release installers → Run workflow** to rehearse the builds. After configuration, tag the intended commit on `main`.

   ```bash
   git switch main
   git pull --ff-only
   npm run version:sync -- --check
   git tag v0.1.0
   git push origin v0.1.0
   ```

   The release publishes after both builds succeed. Check for the Windows EXE, Android APK and AAB, `latest.json`, and `SHA256SUMS.txt`. Find the R8 mapping on the Actions run. The site refreshes its catalog within ten minutes. Verify `/prenesi`, `/download/windows`, and `/download/android` without a GitHub session.

### Windows updater and Authenticode

The updater public key is in `apps/desktop/src-tauri/updater.pub`. Its encrypted private key and password are configured as GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The local key and Windows-user-encrypted password backup are in `%USERPROFILE%\.sotovor-release-signing`. Make a secure offline backup of the key and its password. Keep the same updater key for subsequent releases so installed apps can verify them.

To generate a key for a separate distribution, run `npx --yes @tauri-apps/cli@2.12.5 signer generate --write-keys /path/outside/the/repo/sotovor.key`, enter a password, then use its public half in that distribution's app.

Authenticode supplies Windows publisher identity. The updater uses a separate signature to verify downloads. The workflow builds without Authenticode, and SmartScreen may warn when opening an unsigned installer.

- For a CA-issued exportable signing PFX, set `WINDOWS_SIGNING_PFX_BASE64` and `WINDOWS_SIGNING_PFX_PASSWORD`. A hardware-backed paid certificate can use Tauri's `bundle.windows.signCommand` on a runner with access to the signing hardware.
- For Azure Artifact Signing, formerly Trusted Signing, set up an account and certificate profile and grant the runner signing access. Invoke its SignTool integration from Tauri so it signs before the updater signature and checksums are generated. [Azure signing integrations](https://learn.microsoft.com/en-us/azure/trusted-signing/how-to-signing-integrations)
- For a qualifying open-source project, apply to SignPath Foundation. If approved, integrate signing before generating updater signatures and checksums. [Microsoft signing options](https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options)

### Android release key and Google Play

Generate a release keystore outside the repository. Enter its password at the prompt and keep secure backups.

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore sotovor-release.p12 -alias sotovor -keyalg RSA -keysize 3072 -validity 10000
keytool -list -v -keystore sotovor-release.p12 -alias sotovor
```

Use the listed SHA-256 fingerprint for App Links and Firebase. Add its SHA-1 to Firebase if needed. In GitHub Actions secrets, set `ANDROID_KEYSTORE_BASE64` to the base64 keystore bytes, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` to `sotovor`, and `ANDROID_KEY_PASSWORD`. For the PKCS12 command above, use the same password for both password fields. In PowerShell, `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path '.\sotovor-release.p12')))` returns the base64 value to paste privately into GitHub. When the keystore is absent, the outputs carry `-unsigned` in their names and are omitted from the public install links.

1. In Play Console, create `si.sotovor.app` and complete **Main store listing** with title, screenshots, descriptions, and contact details.
2. In **App content**, enter the public privacy-policy URL and complete **App access**, **Content rating**, and **Data safety** as applicable. Declare the actual handling of family data, accounts, audio, and Firebase. Add a privacy-policy link to the app before public submission. [Play review preparation](https://support.google.com/googleplay/android-developer/answer/9859455) · [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)
3. Enroll in **Play App Signing** when setting up the first release. Add the Play app-signing SHA-256 to the server's App Links fingerprints and the Play signing fingerprints to Firebase. Keep the direct APK fingerprint there too. For cross-channel updates, the installed APK and the Play build need the same app-signing certificate. [Prepare a Play release](https://support.google.com/googleplay/android-developer/answer/9859348)
4. In **Testing → Internal testing**, create a release, upload the signed AAB, add testers, and roll it out. Share the opt-in link. Configure the site's `SOTOVOR_GOOGLE_PLAY_URL` when the listing is available to the intended audience. [Play internal testing](https://support.google.com/googleplay/android-developer/answer/9845334)
