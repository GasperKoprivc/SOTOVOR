# Android release review

The publisher reviews and submits the listing and policy forms. These drafts
describe the current code and must be checked against the chosen hosting,
SMTP, Firebase and optional transcription providers.

- [ ] Set the production HTTPS URL and confirm registration email delivery.
- [ ] Configure the production upload key and enroll in Play App Signing.
- [ ] Add both the Play signing and direct-download certificate fingerprints
      to Firebase and the production App Links configuration.
- [ ] Build the signed AAB and APK with R8, keep `mapping.txt` and verify the
      API target in the generated manifest.
- [ ] Complete a physical-device run from `ANDROID_MANUAL_TEST.md`, including
      login, push, voice and deep links on the final release.
- [ ] Measure the final signed APK size and cold start on representative
      hardware. Compare against the rehearsal measurements in `PERF.md`.
- [ ] Configure account deletion access in the listing and publish the
      reviewed privacy policy and terms at stable public HTTPS URLs.
- [ ] Complete store listing, content rating, target audience, Data safety,
      app access instructions and internal testing. Family use and child
      profiles need a deliberate audience decision by the publisher.

## Target API

The project targets API 36. Google Play's published requirement for ordinary
phone apps is API 36 or newer from 31 August 2026. Recheck the official page
on the actual submission date. [Google Play target SDK requirement](https://developer.android.com/google/play/requirements/target-sdk)

## Data safety draft

| Data                                                        | Current use and review required                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, email, phone and account identifier                   | Registration, sign-in, verification and association with family members. Sent to the Sotovor backend. SMTP providers process recipient email addresses.                                                    |
| Family tasks, calendar, shopping, comments and member roles | Store and synchronize content with authorized family members. Content can include sensitive information entered by users.                                                                                  |
| Audio recordings                                            | Optional microphone recording, up to 30 seconds, stored with an entry for family playback. Transcription is off by default. When configured and requested by a member, the audio is sent to that provider. |
| Firebase registration token and device information          | Optional push delivery, device sessions, app version and selected language. Firebase configuration and privacy terms must be reviewed.                                                                     |
| Diagnostics and infrastructure logs                         | Confirm the deployed proxy, host and providers' retention and processing. The code does not integrate advertising or analytics SDKs.                                                                       |

The app uses HTTPS in production. Account passwords are hashed. Users can
export their account data and delete their account through Profile. Deleting
an owned family requires explicit confirmation. The form's definitions of
collection, sharing, service-provider processing and deletion must be checked
against current Play guidance by the publisher. Do not copy this table as
form answers without that review. [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469)

## Privacy policy text draft for human review

Sotovor is operated by **[legal operator and contact email]**. We process your
name, email, telephone number, account identifier and content you add to
organize your family space. Members of that space can access shared content.
Your password is stored as a hash. Verification and password-reset emails are
delivered through **[SMTP provider]**. Optional phone notifications use Google
Firebase and a device registration token.

If you record a voice note, the recording is uploaded for playback by your
family. Voice transcription is disabled unless the operator configures it.
When you choose to transcribe, the recording is sent to **[provider and
retention policy]**. A private calendar subscription can reveal dated content
to anyone with its secret link. You can revoke that link in the app.

You can export account information or request deletion from Profile. Shared
records and backups require a documented retention policy. **[Specify hosting
location, retention periods, backup expiration, shared-content treatment,
processor list, lawful basis where applicable, children's account rules,
rights requests, international transfers and complaints contact.]**

This text becomes publishable after the operator replaces the placeholders,
checks the deployed behavior and obtains the required human privacy review.
