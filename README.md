# PainCave

Indoor training without a subscription.

**Built for the Zwift Ride smart frame – including its handlebar controllers – and
the Wahoo KICKR CORE 2.** The trainer runs in ERG mode and the Ride's shift paddles
change the target power instead of virtual gears: left ±50 W, right ±10 W.

- **Free ride** – start at 100 W, shift your watts up and down as you go.
- **Planned workouts** – build workouts from steady and ramp blocks and ride them
  with a live profile of what's coming next.
- Heart rate from any Bluetooth heart rate strap, with zone colours.
- Every ride is stored locally (SQLite) for later analysis.

Runs on macOS (Apple Silicon) and Windows. Connects via Bluetooth only.

## Compatibility

| Device | Status |
|---|---|
| Wahoo KICKR CORE 2 | target device (FTMS over Bluetooth) |
| Zwift Ride handlebar controllers | target device |
| Other FTMS smart trainers | should work, untested |
| Bluetooth heart rate straps | standard Heart Rate Service |

Zwift Ride controller firmware newer than 1.2.0 reportedly hides the controller
service, so avoid updating it via Zwift Companion.

Close the Wahoo app, Zwift and Zwift Companion before riding – the trainer and the
controllers usually accept only one app at a time.

## Status

Work in progress. See [docs/spec.md](docs/spec.md) for the V1 scope.

## Disclaimer

PainCave is an independent project. It is not affiliated with, endorsed by or
sponsored by Zwift, Inc. or Wahoo Fitness. "Zwift", "Zwift Ride", "Wahoo" and
"KICKR" are trademarks of their respective owners and are used only to describe
compatibility.
