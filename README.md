# Sotovor

> **Pre-launch review, November 22, 2026:** the domain and VPS have not been set up yet. The code includes production deployment support, but the public launch has not taken place. Verified steps and remaining requirements are tracked in the [launch checklist](docs/LAUNCH_CHECKLIST.md); production, signing and Firebase configuration are covered in the [operator instructions](docs/HUMAN_TASKS.md).

### Less coordination. More time together.

**Sotovor is a shared family space for tasks, plans, a calendar and workload tracking.** It brings together what needs doing, who has taken responsibility, which deadlines are approaching and how responsibilities are distributed among family members.

It is designed for everyday activities: cleaning, shopping, picking up children, family events and other commitments that otherwise get buried in messages or remain in one person's head. Members can claim tasks, request a swap or receive assignments. The admin can also generate an allocation proposal based on roles, availability and existing workload.

> **Current status · November 17, 2026**
> A web app, Windows desktop client and Android project share the same API and MongoDB database. The responsive web version is also available on phones.

**React 19 · Vite 8 · Node.js 24+ · Express 5 · MongoDB · Tauri 2**

**Sotovor Pro — P2:** server-enforced entitlements and a one-time 14-day trial are
complemented by Stripe and a local mock checkout, signed webhooks, a seven-day
payment-failure grace period, daily reconciliation and SL/EN/DE emails. The default
`SOTOVOR_BILLING_ENABLED=false` still unlocks every feature for everyone. Pricing is
EUR 3/month or EUR 30/year including VAT, per family space. Client subscription
management screens follow in P3; live payments have not been enabled.
[Mock and Stripe testing guide](docs/BILLING.md)
· [Entitlements and feature matrix](docs/FEATURE_PARITY.md)
· [Human setup before payments](docs/HUMAN_TASKS.md#sotovor-pro-p2-stripe-setup)

---

## Contents

- [What Sotovor already supports](#what-sotovor-already-supports)
- [Features in detail](#features-in-detail)
- [An everyday example](#an-everyday-example)
- [Quick start on Windows](#quick-start-on-windows)
- [Desktop app](#desktop-app)
- [Running with Docker Compose](#running-with-docker-compose)
- [Production deployment](docs/DEPLOY.md)
- [Publishing installers for the download page](docs/HUMAN_TASKS.md#publish-the-installers)
- [Demo family](#demo-family)
- [WhatsApp integration](#whatsapp-integration)
- [Access from a phone](#access-from-a-phone)
- [Android app](apps/android/README.md)
- [Architecture and structure](#architecture-and-structure)
- [Environment settings](#environment-settings)
- [Development and checks](#development-and-checks)
- [Current limitations and further development](#current-limitations-and-further-development)

## What Sotovor already supports

| Area                        | Available functionality                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| **Accounts**                | Registration, sign-in, sign-out and personal details in Profile.                                  |
| **Interface language**      | English (default), Slovenian and German in the web and desktop clients.                           |
| **Family spaces**           | Creating families, invitations by code or link, and switching between spaces.                     |
| **Members and permissions** | Admin management of members, permissions, family roles, illness and absence.                      |
| **Tasks**                   | Creating, editing, deadlines, categories, assignments, claiming, requesting swaps and completing. |
| **Recurrence**              | Creating the next task on completion, with optional rotation of the responsible member.           |
| **Calendar**                | Monthly and weekly views of events and dated tasks.                                               |
| **Workload overview**       | Personal metrics, filters, search and comparison of open and completed tasks by member.           |
| **Smart planning**          | Local assignment proposals, preview and admin confirmation.                                       |
| **Notifications**           | In-app assignments, deadline reminders and swap requests.                                         |
| **Voice notes**             | Recording up to 30 seconds when adding a task or event, with playback for space members.          |
| **WhatsApp**                | Optional phone-number pairing to create tasks and events from text messages.                      |
| **Clients and startup**     | Web, Windows Tauri, local launchers and Docker Compose.                                           |

## Features in detail

### 1. Landing page, account and first sign-in

The landing page introduces Sotovor and provides sign-in, registration and invitation-based access. Registration collects first name, last name, email address, phone number and password. After signing in, users can view their personal details in Profile and open the dashboard.

Choose a language in the top bar of the landing page or dashboard. The app remembers it in the current browser or desktop client. This also changes date formatting; task titles and member names remain in the language in which they were entered.

If the account does not yet have a family space, the app offers two paths:

- **Create a family:** enter the space name and expected number of members.
- **Join with an invitation:** enter an existing space's code.

Registration in a browser with a session from an older version can link the existing membership to the new account.

### 2. Family spaces and invitations

Each space has its own members, tasks, events and settings. Its creator is the admin.

- The admin can create additional family spaces and switch between them in Profile.
- The **Invite member** menu lets the admin copy a code or share a link that opens the joining flow.
- Generating a new code invalidates the previous invitation.
- Users who already manage a space keep it when accepting an invitation to another family.
- An account can be an ordinary member of one family at a time, in addition to the spaces it manages.
- An ordinary member can request to leave. The admin approves or rejects the request; after an approved departure, the member can create their own space.

### 3. Members, permissions and availability

In **Profile**, the admin sees active members and their count against the expected family size. They can remove members, handle requests to leave and configure four separate permissions:

| Permission     | What it allows                                       |
| -------------- | ---------------------------------------------------- |
| Create entries | Creating tasks and events.                           |
| Edit content   | Changing entry content, category and other settings. |
| Move dates     | Changing event dates or task deadlines.              |
| Remove entries | Removing tasks and events.                           |

New ordinary members can create entries by default; the admin grants editing, date changes and removal permissions separately. Claiming an unassigned task, requesting a swap and completing one's own task are separate actions.

For planning, the admin can configure the following for each member, including themselves:

- **Family role:** father, mother, guardian, child or other.
- **Availability:** available, sick or absent.
- **Absence end date:** an optional date until which the absence or illness applies.

The family role describes a member for planning purposes; admin status determines space management rights.

### 4. The Overview dashboard

The main view brings together a personal greeting, today's date and key information:

- **My open tasks:** the current member's open task count.
- **Available to claim:** the number of tasks without a responsible member.
- **Deadline reminders:** tasks that have reached their configured reminder threshold, including overdue tasks.
- **Family tasks:** a searchable, filterable list.
- **This week:** a compact calendar highlighting days with entries.
- **Workload:** a compact view of open and completed tasks by member.

Clicking a metric opens the corresponding filtered task list; the calendar and workload sections link to their detailed views.

### 5. Tasks from creation to completion

A task has a title and category, with an optional deadline and responsible member. Categories are **Home, Family, Errands, Health and Other**. A task without an assignee is available to claim.

A typical workflow is:

1. A member with permission creates a task and assigns it or leaves it available.
2. Another member claims an available task using **Claim**.
3. If they cannot do it, they select **Request a swap**. The task becomes available again and other members receive an in-app notification.
4. The responsible member completes the task. It remains visible among completed tasks and in workload reports.

Authorized members can edit, reschedule or remove open entries. Removal requires confirmation in the UI. The server checks entry versions during editing and removal to prevent an outdated view from overwriting another member's changes.

### 6. Search, filters and visibility

**Overview** and **Tasks** offer **Open, Mine, Available, Due soon, Recurring and Completed** views.

Each view can be narrowed further by title search, category and selected member or **Unassigned**. Filters work together. Tasks are sorted by deadline, with undated tasks at the end. Larger lists are paginated with 12 tasks per page.

The list displays the responsible person, deadline, overdue status, category, recurrence and rotation settings.

### 7. Repeating tasks and rotation

For a task with a deadline, you can set a recurrence interval in days. A value of `0` means the task does not repeat.

When a member completes a recurring task, Sotovor creates the next entry. Its deadline is calculated from the **previous deadline**, increased by the configured interval. With rotation enabled, the next entry goes to the next active member in joining order; otherwise, it remains assigned to the same person.

For example, completing a "Take out the rubbish" task with a three-day interval and rotation gives the next occurrence a new deadline and the next responsible member. The next entry is created on completion, so the calendar is not filled with all future occurrences in advance.

### 8. Shared calendar

The calendar combines **events** and **tasks with deadlines**. Events require a date; tasks can be undated.

| View                           | Use                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| **Month**                      | Monthly overview; clicking a day opens its tasks and events.                                 |
| **Week**                       | Entries by day from Monday to Sunday, navigation between weeks and a return-to-today action. |
| **This week on the dashboard** | A quick overview of days with entries and their total count.                                 |

Depending on permissions, you can add events and edit entries in the calendar. Adding from a selected day pre-fills the date. Undated tasks remain in the task list.

### 9. Workload and smart proposals

The **Workload** view shows each member's open and completed tasks with a comparative bar chart. Completed tasks can be limited to the last **7 days**, **30 days** or **all time**. Open tasks are shown independently of this filter. The number of open unassigned tasks is listed separately.

Admins also have access to **Smart planning**:

1. Configure member roles and availability in Profile.
2. Choose whether to redistribute tasks already assigned to available members.
3. Click **Create proposal** and review task titles and proposed assignees.
4. Confirm to apply the proposed changes.

The planner considers open tasks from today through the next six days, overdue tasks and undated tasks. It accounts for open responsibilities and, with a lower weight, work completed in the last 14 days. Currently sick or absent members are excluded. Children receive a lower capacity and are assigned only Home, Family and Other categories.

Without redistribution selected, assignments to available members are preserved. If no suitable member exists for a task, it is skipped and shown in the proposal. Confirmation checks the proposal's validity and any intervening changes.

**Planning uses a local server-side algorithm. It does not use an external language model or send family data to one.**

### 10. Reminders, notifications and refresh

For each task, choose how many days before its deadline it should appear among reminders: **0 to 30 days**, with a default of two days.

The **Notifications** menu shows new assignments to the current member, upcoming or overdue deadlines for their tasks, and swap requests. Clicking a notification opens the relevant list; the check mark marks it as read.

Read notifications are stored on the server and synchronized across web, desktop and Android. The server checks assignments, deadlines and swaps every 30 seconds. The dashboard checks for changes approximately every **8 seconds** while the document is visible.

### 11. Voice notes

When creating a task or event, you can record a voice note up to **30 seconds** long. The recording is stored in MongoDB and is accessible to members of the same family space. Playback is available in the list or calendar view.

Recording requires microphone permission and a secure browser context: **localhost or HTTPS**. The server limits recording size to 2 MB. A note is an audio attachment; automatic speech-to-text transcription is not currently available.

## An everyday example

1. Ana creates an account and a "Novak family" space, then invites the other members.
2. She adds "Buy groceries" and "Clean the kitchen" tasks and a "Family lunch" event.
3. Matej claims the shopping task; the kitchen task is assigned to Luka with recurrence and rotation enabled.
4. Luka completes the task; Sotovor creates its next occurrence for the next member.
5. If Matej cannot go shopping, he requests a swap and another member claims the task.
6. Before the new week, Ana reviews the workload, marks absences and confirms a suitable assignment proposal.
7. The family follows shared events in the calendar and upcoming deadlines in notifications.

## Quick start on Windows

You need **Node.js 24 or newer** and **MongoDB Community Server**. The desktop version also requires the tools listed in the next section.

From the project root, run:

```powershell
.\start.bat
```

You can also double-click [start.bat](start.bat). On the first run, the launcher installs packages, builds React and starts MongoDB and Express. When the app is ready, it opens [http://127.0.0.1:3000](http://127.0.0.1:3000). On Windows with Rust available, it also builds and opens the desktop app.

For the web version only:

```powershell
$env:SOTOVOR_WEB_ONLY = '1'
.\start.bat
```

To stop, press **Ctrl+C** in the launcher window.

| Local resource       | Default location        |
| -------------------- | ----------------------- |
| Web app and API      | `http://127.0.0.1:3000` |
| Project MongoDB      | `127.0.0.1:27027`       |
| Local database files | `data/mongodb`          |
| MongoDB log          | `data/mongodb.log`      |

The launcher looks for `mongod` in the usual installation directory or on the system path. For another location, set `SOTOVOR_MONGOD` to the absolute path of `mongod.exe`.

## Desktop app

The Windows client uses **Tauri 2, Rust and WebView2**, with the same React UI and server as the web app. Family data stays on the shared server.

Development and local builds require stable Rust for `x86_64-pc-windows-msvc`, Microsoft C++ Build Tools and WebView2, in addition to Node.js and MongoDB. The first build downloads and compiles Rust dependencies.

To open the desktop window without a browser tab, run:

```powershell
.\start-desktop.bat
```

**Signing in to the desktop app:**

1. Choose **Sign in through browser** or **Register**.
2. Sign in or create an account in your default browser.
3. Compare the displayed code with the code in the desktop window and approve the link.
4. Return to the app, where your space or the family selector opens.

Desktop sign-in persists between launches. The browser and desktop app have separate sessions. Use `SOTOVOR_URL` to connect to a published server.

Executable, NSIS installer and publishing details are in the [desktop app instructions](apps/desktop/README.md).

## Running with Docker Compose

Local Docker startup requires Docker Desktop. From the project root, run:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

If `.env` already exists, keep it and add settings as needed. The app is then available at [http://127.0.0.1:3000](http://127.0.0.1:3000).

Compose starts two services: the React/Express app and the official `mongo:8.0` image. MongoDB data is stored in the named `mongodb-data` volume. Both services are bound to the local computer by default.

```powershell
# Stop services and keep data.
docker compose down

# Start again in the background.
docker compose up -d
```

Stop Compose before switching to local `start.bat` to avoid port conflicts. The local launcher and Compose use separate data stores: `data/mongodb` and a Docker volume, respectively.

### Publishing the Docker image in CI

After a successful push check on `main`, GitHub Actions publishes the **`gasperkoprivc/sotovor`** image with `latest` and `sha-<full-commit>` tags. CI also publishes tagged `v*` releases. React and Express share one image because Express serves the built frontend. MongoDB remains a separate service.

For a public installation with domain-based HTTPS, SMTP email verification and daily backups, follow the [production deployment guide](docs/DEPLOY.md).

Configure these GitHub Actions secrets:

| Secret               | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| `DOCKERHUB_USERNAME` | Docker Hub username.                                            |
| `DOCKERHUB_TOKEN`    | Access token with write permission for `gasperkoprivc/sotovor`. |

Keep the token in GitHub secrets, not in the repository or `.env`. CI uses a temporary MongoDB service for testing.

## Demo family

For a quick demo, start `start.bat`, then run the following from the project root in a second PowerShell window:

```powershell
npm.cmd run seed:demo
Get-Content .\data\demo-password.txt
```

The command creates **Družina Novak · Demo**, four accounts and **seven tasks for every day of the current month**. To choose a month:

```powershell
npm.cmd run seed:demo -- 2026-11
```

November 2026 therefore gets 210 tasks. Repeating the command for the same month does not duplicate entries.

| Person      | Access | Sign-in email             |
| ----------- | ------ | ------------------------- |
| Ana Novak   | Admin  | `ana@demo.sotovor.test`   |
| Matej Novak | Member | `matej@demo.sotovor.test` |
| Luka Novak  | Member | `luka@demo.sotovor.test`  |
| Ema Novak   | Member | `ema@demo.sotovor.test`   |

All four accounts share a password generated locally in `data/demo-password.txt`.

Choose **Sign in** on the landing page, then open the **Dashboard** from Profile. Use Ana's account to check invitations, permissions and planning; use the other accounts to try the member view. To test two people simultaneously, use a private window or separate browser profiles.

## WhatsApp integration

This optional integration uses the **Meta WhatsApp Cloud API**. Normal local startup also works without it.

1. Set `SOTOVOR_WHATSAPP_APP_SECRET`, `SOTOVOR_WHATSAPP_VERIFY_TOKEN` and `SOTOVOR_WHATSAPP_PHONE_ID` in the local `.env`.
2. In Meta settings, subscribe to the `messages` event and register a publicly accessible HTTPS webhook at `/webhooks/whatsapp`.
3. If exposing only the local server's integration, configure the reverse proxy to forward only this path to the internet.
4. As the admin, open **WhatsApp** in the Sotovor family space and generate a code.
5. From the chosen phone number, send the displayed `poveži <code>` message to the business number. The code is valid for 10 minutes.

After pairing, these inputs are supported:

| Message                           | Result                                      |
| --------------------------------- | ------------------------------------------- |
| `Buy milk and bread`              | A new unassigned task with that title.      |
| `dogodek 2027-02-10 Family lunch` | A new calendar event on the specified date. |

One phone number can be linked to each family space. The admin can unlink it in the same menu. The server verifies webhook signatures and prevents duplicate entries from repeated message deliveries.

## Access from a phone

You can open the responsive web app on a phone connected to the same home network. Stop the previous local instance and run:

```powershell
$env:SOTOVOR_HOST = '0.0.0.0'
.\start.bat
```

On the phone, open `http://<computer-local-IP>:3000`. Find the computer's local address with `ipconfig`. MongoDB remains accessible only on the server computer.

This development setup uses HTTP. Recording with a phone's microphone requires HTTPS because a local network IP is not `localhost`.

## Architecture and structure

The web and desktop clients share an **Express API** that validates sessions, membership and permissions, then reads and writes **MongoDB**. Express also serves the built React frontend. The Vite development server proxies API requests to Express.

| Component      | Technology or responsibility                                        |
| -------------- | ------------------------------------------------------------------- |
| User interface | React 19, Vite 8, CSS and Lucide icons.                             |
| Server         | Node.js 24+, Express 5 and JavaScript ESM modules.                  |
| Data           | MongoDB and the official `mongodb` driver.                          |
| Desktop client | Tauri 2, Rust and Windows WebView2.                                 |
| Checks         | Built-in Node.js test runner, API integration tests and Vite build. |
| Distribution   | Local launchers, Docker Compose and GitHub Actions.                 |

### Repository organization

```text
SOTOVOR/
├── frontend/
│   └── src/                 # Pages, components, styles and API client
├── backend/
│   ├── src/                 # API, accounts, database and business logic
│   └── test/                # Integration tests
├── apps/
│   ├── desktop/             # Tauri, Rust, sign-in and Windows instructions
│   └── mobile/              # Starting point for a future Android app
├── scripts/                 # Local startup and demo data generation
├── .github/workflows/       # CI and Docker image publishing
├── .env.example             # Example environment settings
├── Dockerfile               # Shared frontend and API image
├── compose.yaml             # App and MongoDB for local Docker
├── start.bat                # Standard Windows startup
├── start-desktop.bat        # Desktop app startup
└── package.json             # npm workspaces and shared commands
```

Key files for further development:

| File                                                  | Purpose                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| [App.jsx](frontend/src/App.jsx)                       | Navigation, space state, forms and connecting views.          |
| [Overview.jsx](frontend/src/Overview.jsx)             | Metrics, tasks, weekly calendar and workload.                 |
| [MonthCalendar.jsx](frontend/src/MonthCalendar.jsx)   | Monthly calendar and day details.                             |
| [FamilySettings.jsx](frontend/src/FamilySettings.jsx) | Members, permissions, roles and absences.                     |
| [SmartPlanning.jsx](frontend/src/SmartPlanning.jsx)   | Assignment proposal preview and confirmation.                 |
| [api.js](backend/src/api.js)                          | API for families, tasks, events, permissions and voice notes. |
| [planning.js](backend/src/planning.js)                | Local planning algorithm.                                     |
| [recurrence.js](backend/src/recurrence.js)            | Next occurrences and rotation.                                |
| [desktop-auth.js](backend/src/desktop-auth.js)        | Linking desktop sign-in with browser approval.                |
| [whatsapp.js](backend/src/whatsapp.js)                | WhatsApp webhook verification and processing.                 |

### Storage and access protection

Account, family, entry and voice-note data is stored in MongoDB. Passwords are processed with `scrypt`; browser sessions use an `HttpOnly`, `SameSite=Strict` cookie. Data and voice attachments are restricted to the appropriate space, with permissions enforced by the server.

Editing and removing entries uses version checks. Recurring tasks have a recovery mechanism to finish creating the next entry after an interrupted write. Desktop sign-in requires browser approval, link verification and a one-time sign-in exchange.

## Environment settings

The basic example is [.env.example](.env.example). For a temporary PowerShell setting, use `$env:NAME = 'value'` before startup.

| Variable                        | Purpose / default                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SOTOVOR_HOST`                  | API listening address; locally `127.0.0.1`.                                                                                    |
| `SOTOVOR_PORT`                  | Web app port; `3000`.                                                                                                          |
| `SOTOVOR_MONGO_PORT`            | Project-local MongoDB port; `27027`.                                                                                           |
| `SOTOVOR_MONGOD`                | Optional absolute path to `mongod.exe`.                                                                                        |
| `SOTOVOR_MONGO_URI`             | MongoDB connection for direct API startup, tests and tools; the local launcher supplies its own project connection to the API. |
| `SOTOVOR_DB`                    | Database name; `sotovor`.                                                                                                      |
| `SOTOVOR_NO_BROWSER`            | `1` prevents automatic browser opening.                                                                                        |
| `SOTOVOR_WEB_ONLY`              | `1` selects web-only startup through `start.bat`.                                                                              |
| `SOTOVOR_URL`                   | Base server URL for the desktop client.                                                                                        |
| `SOTOVOR_WHATSAPP_APP_SECRET`   | Meta App Secret for webhook signature verification.                                                                            |
| `SOTOVOR_WHATSAPP_VERIFY_TOKEN` | Chosen value for webhook verification when connecting to Meta.                                                                 |
| `SOTOVOR_WHATSAPP_PHONE_ID`     | WhatsApp business phone number ID.                                                                                             |

## Development and checks

The project uses npm workspaces for `frontend` and `backend`. To develop React, keep the local server running and execute this in a second terminal:

```powershell
npm.cmd run dev --workspace frontend
```

Vite proxies API calls to Express on port 3000. If using another port, also set `SOTOVOR_PORT` in the Vite terminal. After changes to locked dependencies, run `npm.cmd ci` from the project root.

### Local commands

| Command                                | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `npm.cmd ci`                           | Install dependencies from locked versions.     |
| `npm.cmd run build`                    | Production build of the React UI.              |
| `npm.cmd test`                         | MongoDB-backed API integration tests.          |
| `npm.cmd run seed:demo`                | Prepare the demo family for the current month. |
| `npm.cmd run dev --workspace frontend` | Vite development server.                       |

Use `npm.cmd` in Windows PowerShell if the execution policy blocks `npm.ps1`.

To check syntax and build:

```powershell
Get-ChildItem backend/src/*.js, scripts/*.js | ForEach-Object { node --check $_.FullName }
npm.cmd test
npm.cmd run build
```

Tests require MongoDB at `127.0.0.1:27027` or the address in `SOTOVOR_MONGO_URI`.

### What tests and CI cover

Integration tests cover task claiming, space isolation, membership and permissions, recurrence with rotation, voice-note access, signed WhatsApp input, stale-edit protection, smart planning and desktop sign-in.

GitHub Actions checks ESLint, Prettier, the API, OpenAPI, Kotlin and dependencies. Playwright and the Android emulator use a temporary Docker Compose stack with a test mail sink. Local review commands are `npm run lint` and `npm run format:check`. See the [launch checklist](docs/LAUNCH_CHECKLIST.md) for the detailed procedure.

## Current limitations and further development

This README describes the currently implemented state. The following limitations matter for further development:

- **Android:** build the [Android Studio project](apps/android/README.md) locally or use the debug APK from GitHub Actions. Public distribution and verified links require signing and a configured public domain.
- **Server connection:** the web and desktop clients share an API and MongoDB; standalone offline operation is not implemented.
- **Notifications:** Android push notifications require Firebase configuration and user permission.
- **Refresh:** the shopping list uses SSE; other views use periodic refresh.
- **Calendar:** supports dates, times, durations and a private ICS subscription. Users confirm adding individual events to their phone's calendar.
- **Recurrence:** supports intervals in days, selected weekdays and a day of the month. The next entry is created when a task is completed.
- **Voice:** transcription is off by default and requires a configured provider and an explicit user action.
- **Smart planning:** the local deterministic algorithm accounts for estimated minutes, roles and availability.
- **WhatsApp:** requires Meta Cloud API configuration and a public HTTPS webhook; it also supports the `nakup mleko` command.

The web and desktop versions already share the same foundation, so further features can be developed through the shared API and user interface.

[Client feature parity](docs/FEATURE_PARITY.md) · [Android manual testing](docs/ANDROID_MANUAL_TEST.md) · [Performance measurements](docs/PERF.md) · [Google Play drafts](docs/PLAY_STORE_CHECKLIST.md)
