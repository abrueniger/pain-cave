# PainCave – V1 spec

Desktop app for indoor training on a **Wahoo KICKR CORE 2** with the **Zwift Ride**
smart frame and its handlebar controllers, without a Zwift subscription.
The trainer runs in ERG mode; the Ride's shift paddles change the target watts.

## Platform

- Electron + TypeScript, Bluetooth via Web Bluetooth (Chromium).
- Developed on Windows, built and used on macOS (Apple Silicon). Unsigned build,
  opened once via right-click → Open (or `xattr -cr`).
- macOS needs `NSBluetoothAlwaysUsageDescription` in the app's Info.plist.
- UI language: English. Dark theme.

## Devices (Bluetooth only)

| Device | Protocol | Required |
|---|---|---|
| KICKR CORE 2 | FTMS (Fitness Machine Service), ERG via *Set Target Power* | yes – Start is disabled without it |
| Zwift Ride controllers | Zwift custom BLE service ("RideOn" handshake, protobuf button events) | no – keyboard fallback |
| Heart rate strap | Standard BLE Heart Rate Service | no – HR tile stays empty |

- **Settings screen** (devices, HR zones, FTP) with three device slots (Trainer, Controller, HR). "Scan" lists devices
  filtered by service; the chosen device's name/id is stored in `settings`.
- On app start, stored devices reconnect automatically (Electron's device chooser
  is intercepted and the stored device is picked without a dialog).
- Status bar shows one dot per device: green connected, yellow searching, grey not found.
- Connection lost during a ride → auto-reconnect, ride continues. On trainer
  reconnect the current target is re-sent. No power data counts as cadence 0 (auto-pause).
- Hint on the devices screen: close the Wahoo app / Zwift / Zwift Companion, the
  trainer and controllers usually accept only one controlling app.

## Hardware findings (spike, 2026-09-26, Windows + bleak)

Verified on the real KICKR CORE 2 and Zwift Ride. Spike code: [`spike/`](../spike).

**KICKR CORE 2** – advertises as `KICKR CORE xxxx`, services FTMS `0x1826` + Cycling Power `0x1818`.
- Control point `0x2AD9`: write `00` (request control), `07` (start), `05 <int16 LE watts>`
  (set target power). Each is acknowledged by an indication `80 <opcode> 01`.
- Indoor Bike Data `0x2AD2`, ~1 Hz, flags `0x0044`: speed (0.01 km/h), cadence (0.5 rpm),
  power (int16 W). ERG follows a new target within ~2–3 s.

**Zwift Ride** – two BLE peripherals named `Zwift Ride`, manufacturer data company `0x094A`,
first byte `0x08` = **left**, `0x07` = right. Advertised service `0xFC82`.
- **Connect to the left one only** – it relays the right controller's buttons.
- Characteristics: `00000002-19ca-4651-86e5-fa29dcdd09d1` notify (events),
  `…0003…` write-without-response (commands), `…0004…` indicate (responses).
- Handshake: subscribe to `…0002` and `…0004`, write ASCII `RideOn` to `…0003`;
  reply `RideOn` on `…0004`. No encryption, no pairing.
- Event `0x23` + protobuf: field 1 = button bitmap varint, **active-low**, full
  state snapshot resent repeatedly → detect edges. Field 3 (repeated) = analog
  `{1: channel, 2: zigzag sint32}`, channel 0/1 = left/right brake paddle, −100…100.
- Other events: `0x19` battery (byte 2 = percent), `0x15` keep-alive (ignore),
  `0x2A` log data after handshake (ignore).

| Bit | Button | Bit | Button |
|---|---|---|---|
| `0x0001` | d-pad left | `0x0100` | left shift up |
| `0x0002` | d-pad up | `0x0200` | left shift down |
| `0x0004` | d-pad right | `0x0400` | left power-up |
| `0x0008` | d-pad down | `0x0800` | left on/off (per BikeControl, not measured) |
| `0x0010` | A | `0x1000` | right shift up |
| `0x0020` | B | `0x2000` | right shift down |
| `0x0040` | Y | `0x4000` | right power-up |
| `0x0080` | Z | `0x8000` | right on/off (per BikeControl, not measured) |

**Gotchas**
- Ride firmware newer than 1.2.0 reportedly hides the custom service until the Zwift
  app unlocks it (BikeControl). Don't update the controller firmware. If the service is
  missing, tell the user that firmware is the likely cause.
- A killed process can leave a stale connection/GATT cache on Windows: the device
  isn't found or characteristics are missing. Reconnect with retry.
- Devices go to sleep quickly when idle; press a button / pedal before scanning.
- HR strap not yet tested on hardware (standard profile, low risk).

## Controls

| Input | Action |
|---|---|
| Left shift up / down | target ±50 W |
| Right shift up / down | target ±10 W |
| Keyboard ↑ / ↓ | ±10 W |
| Keyboard Shift+↑ / Shift+↓ | ±50 W |

- Target clamped to **50–1000 W** (in planned mode: plan + offset is clamped).
- All other Ride buttons are unassigned in V1. Step sizes are constants, no settings UI.
- Target changes from shifting are sent to the trainer immediately.

## Modes

### Free ride
Starts at **100 W** ERG. Shifting changes the target. Runs until you press End.

### Planned workout
A workout is an ordered list of blocks:

- **Steady** – duration, watts.
- **Ramp** – duration, start watts, end watts (up or down). The target rises/falls
  **linearly**, sent to the trainer at most once per second.

Shifting adds an **offset** that applies from now until the end of the workout
(including later blocks and ramps). UI shows it as "plan 170 + 20".
The workout ends automatically after the last block.

## Ride lifecycle

- **Start** (button): recording begins, first target is sent.
- **Pause**: manual (button) or **auto** when cadence is 0 for > 3 s.
  While paused: clock stops, no samples written, plan position frozen,
  trainer resistance set to minimum.
- **Resume**: pedaling again, or button.
- **End**: button, or automatically after the last block. Then the summary screen
  with **Save** / **Discard**.
- Samples are written to the DB continuously (1 Hz), so a crash doesn't lose the ride.
  Discard deletes the ride.

## Ride screen

- Status bar: device dots, current block and next block (planned), Pause, End.
- Large tiles: **Power** (3 s average), **Target** (with "plan X + offset").
- Medium tiles: **Heart rate** (tile coloured by zone), **Cadence**,
  **Time** (planned: block time left + total time left; free: elapsed).
- Full-width chart:
  - planned: whole workout profile in the background, ridden part darker,
    offset shown as dashed line from now on, vertical line at the current position;
  - free: x-axis grows with the ride, target drawn as a step line;
  - both: actual power line, heart rate line on a second axis.
- Footer: avg power, avg HR, kJ, elapsed.
- Recorded but not shown: speed.

### Heart rate zones
% of max HR, max HR stored in `settings` (default **175**):

| Zone | % max HR | Colour |
|---|---|---|
| Z1 | 50–60 | grey |
| Z2 | 60–70 | blue |
| Z3 | 70–80 | green |
| Z4 | 80–90 | yellow |
| Z5 | 90–100 | red |

## Workout builder

- Name + total duration, static profile preview (same chart as the ride),
  updates on every change.
- Block list: type (Steady | Ramp), duration (m:ss), watts or start → end; per row
  duplicate and delete. **Drag & drop** by the handle to reorder; Alt (⌥) or Ctrl
  while dropping copies the block; Alt+↑/↓ moves the focused block.
- "+ Steady" (default 5 min @ 150 W) and "+ Ramp" (default 5 min from the previous
  block's watts to +50 W).
- Explicit Save; warning when leaving with unsaved changes.
- Workout list: new, edit, duplicate, delete, start.

## Home

Free ride card, the 3 most recently edited workouts, the last ride (mini chart +
4 stats) and device status. Look and feel: [design.md](design.md) – dark theme,
violet accent, Archivo.

## Ride history

- List: date, mode, workout name, duration, avg power, avg HR, kJ.
- Detail: static ride chart + summary (same screen as the post-ride summary). Delete.

## Data (SQLite via built-in `node:sqlite`, no native module)

Stored in the Electron `userData` directory.

```
workouts   id, name, power_unit ('watts'|'ftp'), category, blocks_json, created_at, updated_at
rides      id, started_at, ended_at, mode, workout_id, workout_name, ftp,
           blocks_json (resolved snapshot: absolute watts, intervals expanded),
           duration_s, avg_power, max_power, avg_hr, max_hr, avg_cadence, kj
samples    ride_id, t_s, power, target_power, cadence, hr, speed
ride_bests ride_id, duration_s (5|60|300|1200), watts
settings   key, value   (maxHr, ftp, device.*)
```

Migrations via `PRAGMA user_version` (v1 example workout, v2 units/categories/bests +
15-workout library in % FTP). Blocks: steady, ramp, intervals (repeat × on/off); power in
the workout's unit. A ride resolves the plan to absolute watts with the FTP at start.
`.zwo` import maps SteadyState/Warmup/Cooldown/Ramp/IntervalsT (FreeRide → 55 %,
MaxEffort → 150 %). Progress screen: weekly volume, time in HR zones, best efforts,
FTP estimate (95 % of the best 20 min, last 90 days), fitness per repeated workout
(avg power / avg HR).

Samples store raw values, the 3 s average is display-only.

## Development

- **Fake devices** mode: simulated trainer (power noisy around target, cadence ~90),
  simulated HR (slowly rising with load), shifting via keyboard. Enables UI work
  without hardware.

## Build order

1. ~~Hardware spike~~ – done (Python/bleak), see *Hardware findings*.
2. Fake devices + free ride incl. recording and DB.
3. Planned workouts + builder.
4. Ride history.
5. macOS build.

## Out of scope for V1

Wi-Fi / Wahoo Direct Connect (DIRCON), TSS/CTL training load, Strava / FIT export,
intervals.icu sync,
code signing, auto-update, settings UI beyond max HR.
