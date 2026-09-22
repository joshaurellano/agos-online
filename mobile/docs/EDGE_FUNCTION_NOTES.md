# Making Critical alerts loud: one change on the server

The app now creates three Android notification channels:

| Channel id       | Used for                         | Behavior                                               |
|------------------|----------------------------------|--------------------------------------------------------|
| `agos_critical`  | CRITICAL alerts                  | Plays on the **alarm** volume stream, long vibration   |
| `agos_warning`   | WARNING alerts                   | Loud heads-up, distinct vibration                      |
| `agos_alerts`    | ADVISORY / INFO / community      | Existing channel (unchanged)                           |

**A push received while the app is in the background is displayed by Android
itself, using the channel named in the FCM payload.** Your Supabase Edge
Function (`send-push-notification`) wasn't in the zip I received, so I could not
change it. Until it names a channel, every push keeps using `agos_alerts`
exactly as before, so nothing breaks, but Critical alerts won't be any louder.

## The change

Where the function builds the FCM message, pick the channel from the alert
`type` (`CRITICAL`, `WARNING`, `ADVISORY`, `INFO`, matching the `alerts.type`
column):

```ts
const channelFor = (type: string) =>
  type === "CRITICAL" ? "agos_critical"
  : type === "WARNING" ? "agos_warning"
  : "agos_alerts";

// inside the FCM v1 message:
android: {
  priority: "HIGH",
  notification: {
    channel_id: channelFor(alert.type),   // <- the important line
  },
},
```

Keep sending `data: { type: ... }` as you do now. The app uses it to decide which
screen a tap opens.

## Foreground behavior (already handled in the app)

Android does not display a push while the app is open. The app now shows it
itself, on the channel the server named, so it sounds and looks the same as a
background alert.
