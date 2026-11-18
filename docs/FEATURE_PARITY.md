# Feature parity

| Feature | Backend / OpenAPI | Web and Tauri | Android |
| --- | --- | --- | --- |
| Shared shopping list | Family API and WhatsApp quick add | Add, check, uncheck, remove, live updates | Add, check, uncheck, remove, optional FCM alerts |
| Event time and duration | All-day or timed events with optional duration | Editor and weekly time blocks | Editor and weekly time blocks |
| Private calendar subscription | Private ICS, rotate and revoke | Calendar subscription controls | Subscription controls and add an event to the phone calendar |
| Task checklists and comments | Family-scoped details and comment notifications | Task details dialog | Details inside task editor |
| Task duration and planner weighting | Optional estimate and minute-weighted planning | Task editor and planner guidance | Task editor and planner guidance |
| Points and rewards | Admin-controlled rewards and child scores | Task editor and reward thresholds | Task editor and reward thresholds |
| Weekly and monthly recurrence | Successor on completion, with rotation | Task editor | Task editor |
| Today widget | Member-scoped today endpoint and existing completion action | Android home-screen feature | Glance widget, open or complete, background refresh |
| Voice transcription | Planned | Planned | Planned |
| English and dark mode | Planned | Planned | Planned |

## Shared shopping list

Open **Nakupi** in the family space. Add an item and an optional quantity such as
`2 kg`. Checking an item records the member who bought it. Any member can put it
back on the active list or remove it. Web clients connected to the same app
instance update immediately through SSE.

After pairing the family through the existing WhatsApp integration, send
`nakup mleko` to add milk to the shopping list. The webhook ignores duplicate
deliveries. With Firebase configured, Android members can individually enable
shopping notifications in the shopping screen and grant OS notification access.
Alerts point to the family list and omit item names.

## Event time and duration

Choose **Ves dan** to keep a date-only event. Turn it off to pick a start time
and optionally give the event a duration in minutes. The week view sorts timed
events by start time and shows the continuation on the following day for
overnight events. Times are stored as Europe/Ljubljana local wall time. Older
clients can edit an event without overwriting its timing when they omit the new
fields; existing date-only entries are displayed as all-day.

## Private calendar subscription

Open **Zasebna naročnina na koledar** in the calendar, create a link, and add
that URL as a subscription in your calendar app. It includes events and dated
tasks for all current family memberships. The link is a secret, shown only
when created. Rotate or revoke it if shared by mistake. Previously downloaded
copies may remain in the external calendar's cache.

On Android, open an event and choose **Dodaj v koledar telefona** to hand off
a pre-filled event to an installed calendar app. The user confirms it there.

## Task checklists and comments

Open the details of an existing task. All family members can comment and use
the checklist while the task is open. Completed tasks keep a read-only
checklist and still accept comments. Other family members with assignment
notifications enabled receive comment alerts.

## Estimated task duration

Set an optional estimate in the task editor. The planner uses 30 minutes for
tasks without an estimate and one quarter of the estimate for recent completed
work. It keeps availability, age-appropriate categories, and the existing
planning window. Recurring copies keep the estimate.

## Points and rewards

Family admins can add optional points to a task and set reward thresholds in
the Workload tab. Completing the task credits those points once to its child
assignee. Rewards use earned totals as milestones. With the leaderboard off,
children can see their own score and other members see only the rewards.

## Weekly and monthly recurrence

Set a due date and select either specific weekdays or a day of the month.
A monthly schedule for the 31st uses the last day of shorter months and
returns to the 31st when possible. Day intervals remain available. All three
modes create the next task on completion and can rotate the assignee.

## Android widget

Add **Moja opravila danes** from the Android launcher widget picker. The
widget displays up to three open tasks assigned to you and due today in the
active family. Tap a task to open it, or tap **Končano** to complete it. Android
schedules periodic and push-triggered refreshes through WorkManager. The
launcher can display the titles to anyone with access to the home screen.
