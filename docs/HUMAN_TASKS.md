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
