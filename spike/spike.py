"""Hardware spike: FTMS trainer (ERG), Zwift Ride controllers, HR strap.

  python spike.py scan                      # list BLE devices + services
  python spike.py run [--seconds 120]       # connect all found devices, log, shift = ERG watts
  python spike.py selftest                  # parser checks, no hardware

Throwaway code: validates the protocols before the real app is built.
"""
import argparse
import asyncio
import struct
import sys
import time

from bleak import BleakClient, BleakScanner

from ride_probe import parse_ride

FTMS = "00001826-0000-1000-8000-00805f9b34fb"
FTMS_BIKE_DATA = "00002ad2-0000-1000-8000-00805f9b34fb"
FTMS_CONTROL = "00002ad9-0000-1000-8000-00805f9b34fb"
HRS = "0000180d-0000-1000-8000-00805f9b34fb"
HR_MEASUREMENT = "00002a37-0000-1000-8000-00805f9b34fb"

RIDE_ASYNC = "00000002-19ca-4651-86e5-fa29dcdd09d1"
RIDE_SYNC_RX = "00000003-19ca-4651-86e5-fa29dcdd09d1"
# Zwift Ride button bits (active-low in the wire format, parse_ride inverts): measured on hardware
SHIFT_STEPS = {0x0100: +50, 0x0200: -50, 0x1000: +10, 0x2000: -10}

MIN_W, MAX_W = 50, 1000
T0 = time.monotonic()


def log(*a):
    line = f"{time.monotonic() - T0:8.2f} " + " ".join(str(x) for x in a)
    print(line, flush=True)
    with open("spike.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


def parse_bike_data(b: bytes) -> dict:
    """FTMS Indoor Bike Data (0x2AD2). Field order per FTMS spec 4.9."""
    flags = struct.unpack_from("<H", b, 0)[0]
    i, out = 2, {}

    def take(fmt, name=None, scale=1.0):
        nonlocal i
        v = struct.unpack_from(fmt, b, i)[0]
        i += struct.calcsize(fmt)
        if name:
            out[name] = v * scale

    if not flags & 0x0001:
        take("<H", "speed_kmh", 0.01)
    if flags & 0x0002:
        take("<H")  # avg speed
    if flags & 0x0004:
        take("<H", "cadence", 0.5)
    if flags & 0x0008:
        take("<H")  # avg cadence
    if flags & 0x0010:
        i += 3  # total distance uint24
    if flags & 0x0020:
        take("<h", "resistance")
    if flags & 0x0040:
        take("<h", "power")
    if flags & 0x0080:
        take("<h")  # avg power
    if flags & 0x0100:
        i += 5  # energy: total u16, per hour u16, per minute u8
    if flags & 0x0200:
        take("<B", "hr")
    return out


def parse_hr(b: bytes) -> int:
    return struct.unpack_from("<H", b, 1)[0] if b[0] & 0x01 else b[1]


async def scan(seconds=10):
    found = await BleakScanner.discover(timeout=seconds, return_adv=True)
    for addr, (dev, adv) in sorted(found.items(), key=lambda kv: -kv[1][1].rssi):
        mfr = {hex(k): v.hex() for k, v in adv.manufacturer_data.items()}
        print(f"{addr} rssi={adv.rssi:4} name={adv.local_name!r} services={adv.service_uuids} mfr={mfr}")


class Trainer:
    def __init__(self, client: BleakClient):
        self.c = client
        self.target = 100

    async def start(self):
        await self.c.start_notify(FTMS_CONTROL, lambda _, d: log("FTMS cp <-", d.hex()))
        await self.c.start_notify(FTMS_BIKE_DATA, lambda _, d: log("TRAINER", bytes(d).hex(), parse_bike_data(bytes(d))))
        await self.c.write_gatt_char(FTMS_CONTROL, b"\x00", response=True)  # request control
        await self.c.write_gatt_char(FTMS_CONTROL, b"\x07", response=True)  # start/resume
        await self.set_target(self.target)

    async def set_target(self, watts):
        self.target = max(MIN_W, min(MAX_W, watts))
        log("FTMS set target", self.target)
        await self.c.write_gatt_char(FTMS_CONTROL, b"\x05" + struct.pack("<h", self.target), response=True)


async def run(seconds):
    log("scanning...")
    found = await BleakScanner.discover(timeout=10, return_adv=True)
    trainer_dev = hr_dev = None
    for dev, adv in found.values():
        uuids = [u.lower() for u in adv.service_uuids]
        if FTMS in uuids and not trainer_dev:
            trainer_dev = dev
        elif HRS in uuids and not hr_dev:
            hr_dev = dev
    # Left Ride controller (manufacturer 0x094A, first byte 0x08) relays the right one's buttons too.
    ride_dev = next((d for d, a in found.values() if a.manufacturer_data.get(0x094A, b"")[:1] == b"\x08"), None)
    log("trainer:", trainer_dev, "| ride:", ride_dev, "| hr:", hr_dev)

    clients = []
    trainer = None
    try:
        if trainer_dev:
            c = BleakClient(trainer_dev)
            await c.connect()
            clients.append(c)
            trainer = Trainer(c)
            await trainer.start()
        if ride_dev and trainer:
            c = BleakClient(ride_dev)
            await c.connect()
            clients.append(c)
            held = {"b": 0}
            loop = asyncio.get_running_loop()

            def on_ride(_, d):
                d = bytes(d)
                if d[0] != 0x23:
                    return
                buttons, _a = parse_ride(d)
                pressed, held["b"] = buttons & ~held["b"], buttons
                for bit, delta in SHIFT_STEPS.items():
                    if pressed & bit:
                        log("SHIFT", hex(bit), f"{delta:+}")
                        loop.create_task(trainer.set_target(trainer.target + delta))

            await c.start_notify(RIDE_ASYNC, on_ride)
            await c.write_gatt_char(RIDE_SYNC_RX, b"RideOn", response=False)
            log("ride ready")
        if hr_dev:
            c = BleakClient(hr_dev)
            await c.connect()
            clients.append(c)
            await c.start_notify(HR_MEASUREMENT, lambda _, d: log("HR", parse_hr(bytes(d))))
        await asyncio.sleep(seconds)
    finally:
        for c in clients:
            await c.disconnect()
        log("done")


def selftest():
    # flags 0x0044: speed present (bit0=0), cadence, power
    b = struct.pack("<HHHh", 0x0044, 3050, 180, 172)
    assert parse_bike_data(b) == {"speed_kmh": 30.5, "cadence": 90.0, "power": 172}, parse_bike_data(b)
    assert parse_hr(bytes([0x00, 142])) == 142
    assert parse_hr(bytes([0x01, 0x8E, 0x00])) == 142
    print("selftest ok")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["scan", "run", "selftest"])
    p.add_argument("--seconds", type=int, default=120)
    a = p.parse_args()
    if a.cmd == "selftest":
        selftest()
    elif a.cmd == "scan":
        asyncio.run(scan())
    else:
        asyncio.run(run(a.seconds))
    sys.exit(0)
