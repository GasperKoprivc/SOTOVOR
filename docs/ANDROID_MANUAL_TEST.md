# Android device acceptance

Record date, app version, APK SHA-256, device/API level, release signing
fingerprint, server URL, tester and result for every run. Use a disposable
family on staging. Repeat critical flows with the exact signed, R8-minified
APK downloaded through `/prenesi` before approving production.

| Scenario             | Steps and expected result                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh installation   | Install from the official HTTPS domain. Sign in, verify email, create a family, invite another phone and confirm isolation from another family.                                                                                                             |
| Notifications denied | On Android 13+, deny the notification prompt. Continue creating and completing tasks. In-app notices still work. Enable notifications later through system settings and retry.                                                                              |
| Push                 | Use a real Firebase-configured signed build. Assign a task from another account. Check foreground, background and terminated-app delivery, channel, target task, read state and revoked-session behavior. Toggle shopping notifications and verify consent. |
| Deep links           | Open an invite HTTPS link from another app. Open a task notification for each family. Try an expired invite, invalid entry, signed-out app and a second family. Verify production `assetlinks.json` matches the installed signing certificate.              |
| Voice                | Grant and deny microphone permission. Record, stop, play back, save, reopen and play in another client. Test a 30-second limit, interruption by a phone call, rotation while recording and deleting the containing task.                                    |
| Rotation             | Rotate during login, task editing, calendar navigation, shopping quick add and after permission denial. Inputs and current family remain correct without duplicate writes.                                                                                  |
| Theme and language   | Select Slovenian/English and light/dark/system. Restart, switch families and compare the other client. At system theme changes, check calendar, dialogs, input fields and widget.                                                                           |
| TalkBack             | Traverse every screen, dialog, calendar day, icon button, checkbox and widget action. Confirm spoken names, logical order, selected state and dismiss action. Use Accessibility Scanner for contrast and 48dp targets.                                      |
| Large text           | Set system font scale to 200% and enlarged display size. Login, create/edit a task, open calendar, change settings and add shopping items. Text wraps and every action remains reachable.                                                                   |
| Poor connection      | Disable network before load and while saving. Retry after reconnecting. Inputs remain available, errors are clear and tasks are not completed twice. Test packet loss and a slow connection.                                                                |
| Widget               | Add the widget, complete a task, tap a task to open it, receive a push, switch family, sign out and sign in as another account. Cached titles must clear when credentials are revoked.                                                                      |
| R8 and update        | Install the production release, then install the next version over it. Exercise login/refresh, push, voice and deep links. Keep `mapping.txt` for each version.                                                                                             |

Automated coverage is in `FamilyFlowTest` and `SotovorUiTest`. Firebase delivery,
audio hardware, TalkBack traversal and production App Links still require a
physical device. Record failures in the launch checklist and fix them before
marking the device run accepted.
