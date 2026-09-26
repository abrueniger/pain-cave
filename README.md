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

## Getting started

Requires Node 24+.

```bash
npm install
npm run dev        # real Bluetooth devices
npm run dev:fake   # simulated trainer, controller and HR strap (F8 toggles pedaling)
npm test
```

Every push to `main` builds the macOS app on GitHub Actions: open the latest
[CI run](https://github.com/abrueniger/pain-cave/actions/workflows/ci.yml) and download
the **PainCave-mac** artifact (`.dmg`). To build it yourself on a Mac (Apple Silicon):

```bash
npm run build:mac  # → dist/PainCave-<version>-arm64.dmg
```

The build is unsigned: open it once via right-click → Open, or run
`xattr -cr /Applications/PainCave.app`.

Pair your devices on the **Devices** screen once; they reconnect automatically on
the next start. Keyboard fallback during a ride: ↑/↓ ±10 W, Shift+↑/↓ ±50 W,
Space pause/resume.

See [docs/spec.md](docs/spec.md) for the V1 scope and the verified hardware protocol.

## Disclaimer

PainCave is an independent project. It is not affiliated with, endorsed by or
sponsored by Zwift, Inc. or Wahoo Fitness. "Zwift", "Zwift Ride", "Wahoo" and
"KICKR" are trademarks of their respective owners and are used only to describe
compatibility.
