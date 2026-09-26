"""Connect to all Zwift Ride controllers, do the RideOn handshake, print button/analog changes.

  python ride_probe.py [seconds]
"""
import asyncio
import sys
import time

from bleak import BleakClient, BleakScanner

B = "-19ca-4651-86e5-fa29dcdd09d1"
ASYNC, SYNC_RX, SYNC_TX = "00000002" + B, "00000003" + B, "00000004" + B
T0 = time.monotonic()


def varint(b, i):
    v = s = 0
    while True:
        x = b[i]
        i += 1
        v |= (x & 0x7F) << s
        s += 7
        if x < 0x80:
            return v, i


def parse_ride(b: bytes):
    """0x23 message: protobuf, field 1 = button bitmap (active-low), field 3 = analog {1: location, 2: zigzag value}."""
    i, buttons, analog = 1, None, {}
    while i < len(b):
        key, i = varint(b, i)
        field, wt = key >> 3, key & 7
        if wt == 0:
            v, i = varint(b, i)
            if field == 1:
                buttons = (~v) & 0xFFFFFFFF
        elif wt == 2:
            n, i = varint(b, i)
            sub, i, j, d = b[i:i + n], i + n, 0, {}
            while j < len(sub):
                k, j = varint(sub, j)
                v, j = varint(sub, j)
                d[k >> 3] = v
            zz = d.get(2, 0)
            analog[d.get(1, 0)] = (zz >> 1) ^ -(zz & 1)
        else:
            break
    return buttons, analog


def out(*a):
    line = f"{time.monotonic() - T0:7.2f} " + " ".join(str(x) for x in a)
    print(line, flush=True)
    with open("ride.log", "a", encoding="utf-8") as f:
        f.write(line + "\n")


async def connect(dev):
    tag = dev.address[-5:]
    last = {}

    def on_async(_, d):
        d = bytes(d)
        if d[0] == 0x23:
            state = parse_ride(d)
            if state != last.get("s"):
                last["s"] = state
                out(tag, "buttons=%08x" % state[0], "analog", state[1])
        elif d[0] == 0x19:
            out(tag, "battery", d[2], "%")
        elif d[0] != 0x15:  # 0x15 = keep-alive
            out(tag, "msg", d.hex())

    c = BleakClient(dev, timeout=20)
    await c.connect()
    await c.start_notify(ASYNC, on_async)
    await c.start_notify(SYNC_TX, lambda _, d: out(tag, "sync", bytes(d)))
    await c.write_gatt_char(SYNC_RX, b"RideOn", response=False)
    return c


async def main(seconds):
    found = await BleakScanner.discover(timeout=10, return_adv=True)
    rides = [(d, a) for d, a in found.values() if a.local_name == "Zwift Ride"]
    for d, a in rides:
        out("found", d.address, {k: v.hex() for k, v in a.manufacturer_data.items()})
    clients = [await connect(d) for d, _ in rides]
    out("READY - press buttons")
    await asyncio.sleep(seconds)
    for c in clients:
        await c.disconnect()
    out("done")


if __name__ == "__main__":
    b = bytes.fromhex("2308ffdfffff0f1a04080010001a0408011017")
    assert parse_ride(b) == (0x1000, {0: 0, 1: -12}), parse_ride(b)
    asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 60))
