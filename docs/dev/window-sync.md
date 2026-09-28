# Window synchronization

The control window keeps several other windows and devices in step: output windows on
the same computer, viewers' phones, and speakers' remotes that send commands back. This
page explains how each path works, why it works that way, and what it costs, with the
numbers measured while it was built. It is for developers who change how slides or
commands travel; the rest of the app is in [Architecture](architecture.md).

## Three paths

| Path                     | From → to                                      | Transport                                       |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Slides to output windows | control window → `/presenter`, `/stage`        | the window bus: BroadcastChannel + localStorage |
| Slides to phones         | control window → hub → `/follow`, `/remote`    | WebSocket `/api/ws`                             |
| Commands back            | output windows' keys, remotes → control window | the window bus; the hub for remotes             |

Every command, whatever its source, ends in one pipeline in the control window
(`web/src/lib/commands.ts`), and only the leading control window acts on it.

## Choosing the transport

The `/bench` page (**Синхронізація вікон**, `web/src/components/SyncBench.tsx`) sends the
payloads the app really sends through each transport a window bus could use and measures
the round trip (median), how long the send blocks the sender, and bursts.

Round trip for a slide with a background photo (a data URL of about 1.5 MB):

| Transport        | Windows, 1.3.0             | Mac, Chrome 154, a separate window |
| ---------------- | -------------------------- | ---------------------------------- |
| BroadcastChannel | 10 ms (sender blocked 2.5) | 1.7 ms                             |
| `storage` events | 46 ms (blocked 14, max 32) | 12 ms                              |
| `postMessage`    | 2.1 ms                     | 0.5 ms                             |
| SharedWorker     | 4.1 ms                     | 0.7 ms                             |

Text slides cost 0.1–0.6 ms on every transport. Bursts reached 7 000–9 700 messages a
second on Windows and 24 000–42 000 on the Mac, with no message lost.

Two conclusions shaped the bus:

- **The payload, not the transport, was the cost.** Every slide carried its background
  photo, and every change wrote it to localStorage, which blocks the control window and
  fires a `storage` event in every window of the app.
- **BroadcastChannel reaches every window without a reference.** `postMessage` is
  faster, but it needs a reference to the target window: a window opened by another
  control window, or with `noopener`, has none. BroadcastChannel reaches every window of
  the same origin.

## The window bus

The bus (`web/src/lib/bus.ts`, protocol v2) runs over one BroadcastChannel and a small
localStorage copy, behind the `presenterBus.ts` API:

- **Assets once.** A background travels once as an asset whose id is its length plus an
  FNV-1a hash; slides refer to it as `asset:<id>`, and receivers resolve it back.
- **One ordered stream.** Live slides, the next slide, assets, commands, and the
  handshake share one channel. Publishes carry an `epoch` (the control window's session)
  and a `seq`, so a receiver drops stale copies.
- **Handshake.** A window that opens or reloads sends `hello`; the publishing window
  answers with its assets and the current live and next slides. A receiver still missing
  an asset asks for it with `need`.
- **Cold start.** localStorage keeps the last live and next slides, with the asset
  reference, and the current asset. An output window opened while no control window runs
  still shows the last slide.
- **No duplicates.** An identical publish is dropped, both in the bus and in the control
  window.

What bus v2 changed (1.3.1, measured in the control window):

| Measure                                              | Before  | After                                  |
| ---------------------------------------------------- | ------- | -------------------------------------- |
| Publishing a slide with a 1.4 MB background (median) | 15.9 ms | 0.0 ms (14 ms once per new background) |
| The slide kept in localStorage                       | 1.5 MB  | 1.4 KB                                 |
| Publishes per step with **Наживо** on                | 7–10    | 1, plus 1 for the next slide           |

## Output windows

Each output window announces itself on the bus (`web/src/lib/outputs.ts`): its kind,
bounds, fullscreen and visibility state, with a heartbeat every 5 seconds, a goodbye on
close, and an identify overlay on request. `web/src/lib/screens.ts` lists screens and
places windows with the Window Management API.

With **Окремий процес для кожного вікна**, output windows open with `noopener` and get a
renderer process of their own. When an output window's renderer crashed (Edge, CDP
`Page.crash`), the control window survived and the window's row went from the panel in
about 9 seconds; without the option, the control window crashed with it.

Latency from a phone's **Далі** to the output window (1.5.28, Windows, Chrome 154, 10 runs
each) — the message arrives / the new text is in the page / the text is fully shown:

| Transition   | Shared renderer   | Own process      |
| ------------ | ----------------- | ---------------- |
| Плавний      | 19 / 375 / 731 ms | 1 / 348 / 705 ms |
| Швидкий      | 22 / 33 / 188 ms  | 2 / 3 / 162 ms   |
| Без анімації | 20 / 26 / 34 ms   | 1 / 2 / 9 ms     |

Sharing the control window's renderer costs about 20 ms on Windows and 29 ms on a Mac.
Across 42 slide changes, sampled on every frame, not one frame flashed.

## One control window in charge

Two control windows used to publish their own selections to the same outputs. Now they
elect a leader with the Web Locks API (`web/src/lib/leader.ts`): each window requests
one lock; the holder leads, the others wait in the lock's queue, and the browser hands
the lock to the next window when the leader closes or crashes, without a heartbeat.
**Взяти керування** steals the lock. A waiting window publishes nothing, mirrors what is
on screen, and doesn't talk to the hub; a window that becomes the leader takes the
screen over as it is.

## Commands

The command pipeline (`web/src/lib/commands.ts`):

- tries handlers by priority, so an open song claims **Далі** before verse navigation;
- applies each command id once, so a remote that resends after a reconnect can't step
  twice;
- returns the outcome to the source: done, or why not («Це останній вірш розділу»).

The hub forwards a remote's command to the leading control window and acks the remote
with the control window's real result, or with a timeout after 2.5 seconds. The ack took
1.8 ms (1.3.3).

## Phones: the hub

The hub (`server/src/live.ts`) keeps what is on screen in memory and pushes every change
to the sockets at `/api/ws`. Viewers are read-only; the control window upgrades with a
`hello` from this machine, and a remote with its pairing token. A viewer page falls back
to polling `GET /api/live` every 1.5 seconds while its socket is down.

Clients reconnect after 0.5 s, 1 s, and then every 2 seconds, and at once when the
network comes back or the page is shown again (`web/src/lib/liveSocket.ts`). Rejoin time
after the server is back, with a TCP proxy playing the outage (1.5.29, Chrome 154):

| Outage | Retries capped at 10 s | Retries every 2 s |
| ------ | ---------------------- | ----------------- |
| 2 s    | 1.4 s                  | 1.5 s             |
| 5 s    | 2.4 s                  | 0.55 s            |
| 12 s   | 3.5 s                  | 1.5 s             |
| 26 s   | up to 9.5 s            | 1.7 s             |

The control window warns about a lost hub 4 seconds after the drop, and a phone brought
back on screen rejoins in 17 ms.

## Run the benchmark

To measure the transports on your machine, open `/bench` and select the
**Синхронізація вікон** tab. Pick the transports and the partner — **Окреме вікно** for a
real second window, or **Фрейм** — and run it. The report shows the median, p95, and
sender blocking for each transport and payload.
