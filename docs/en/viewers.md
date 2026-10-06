# Viewers' phones

[Українською](../viewers.md) · English

This page is for the operator: how to give viewers the text on their phones so they read
along with the screen. Phones connect to the computer with the app over the same Wi-Fi
network; no internet connection is needed for that. How to give the speaker a phone remote
is in [Speaker remote](remote.md).

## Before you begin

- The app is started from the start window (`start.cmd`, `start.command`, or
  `./start.sh`). If the app runs “In the browser”, without the server, the **Viewers** and
  **Speaker remote** buttons are inactive.
- The computer and the viewers' phones are on the same Wi-Fi network. The computer can also
  be connected by cable to the same router.

## Turn on the broadcast

For the viewers to see the text on their phones:

1. At the top, click the **Viewers** icon.
2. Turn on **Broadcast to viewers' phones**. A QR code and an address for the phones
   appear in the panel.
3. To show the QR code to everyone, click **QR code to screen**: the QR takes the screen in
   place of the slide. When the viewers have scanned it, click
   **Take the QR code off the screen** — the previous slide comes back to the screen.

![The Viewers panel: the broadcast on, one phone connected, the QR code and the address for
the phones, the QR code to screen button](../img/en/viewers-panel.png)

A viewer scans the QR code with the phone's camera or types the address from the panel into
the browser. The **Connected** counter shows how many phones are connected. While the
broadcast is on, the **Viewers** icon at the top is red.

So that latecomers can connect too, turn on **A QR code in the corner of the screen**: a
small QR code stands in the corner of every slide. You choose how the code looks on screen
in **QR code style on screen**: **Classic**, **Rounded**, or **Dots**.

## What the viewers see

A viewer's phone shows the text on screen now, with its reference at the bottom. The text
changes with the screen. The page's colors follow the phone's light or dark theme.

![A viewer's phone: John 3:16 on a dark background; at the bottom, the Aa button and the
reference John 3:16](../img/en/phone-follow.png)

Other states of the page:

| On the phone                                 | Why                                                 |
| -------------------------------------------- | --------------------------------------------------- |
| `· · ·`                                      | there is no text on screen: it is hidden or cleared |
| a frame of the video or “Video on screen”    | a video is on screen; the phone doesn't play it     |
| “Broadcast paused”                           | the operator turned off the broadcast               |
| “No connection to the show. Reconnecting…”   | the phone lost the connection and tries again       |
| “The show is over: the app is switched off.” | the app is switched off completely                  |

The viewer doesn't need to reload the page: it connects again by itself.

To read more comfortably, the viewer taps **Aa** on the phone. There they can change the
text **Size**, turn on **Bolder** or **Easier reading** — the Andika font, wider spacing,
and text on the left, easier with dyslexia. These settings are kept on that phone only.

## If a phone doesn't open the page

If the page from the QR code doesn't open on a phone, check in turn:

1. The phone is connected to the same Wi-Fi network as the computer, not to mobile data or
   a guest network. Guest networks often keep devices from reaching each other.
2. The computer's firewall lets the connection through. On the first start, Windows asks
   whether to allow Node.js network access: allow it for private networks, and mark the
   network the computer is on as private. On macOS with the firewall on, likewise allow
   incoming connections for `node`.
3. If the computer is connected to several networks, for example by cable and Wi-Fi, the QR
   code may lead to another network. Then type the address on the phone by hand:
   `http://COMPUTER_IP:4747/follow`. Replace `COMPUTER_IP` with the computer's IP address in
   the phone's network, and `4747` with the port from the start window if it differs.

## What's next

- [Speaker remote](remote.md): a phone from which the speaker steps through the show.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
