# Speaker remote

[Українською](../remote.md) · English

A speaker remote is a phone from which the speaker steps through the show. This page is for
the operator: how to create a remote, what to allow the speaker, and how to take control
back. How to give the text to viewers' phones is in [Viewers' phones](viewers.md).

## Before you begin

A remote needs the same as viewers' phones: the app started from the start window, and one
Wi-Fi network for the computer and the phone. More in
[Viewers' phones](viewers.md#before-you-begin).

## Create a remote

To create a remote:

1. At the top, click the **Speaker remote** icon.
2. In the **Name** field, type the remote's name, for example `Speaker`. The name shows on
   the phone and in the list of remotes.
3. In the **Allowed** group, select what the remote may do. By default, **Next**, **Back**,
   and **Hide text** are selected. What each permission means is in
   [Permissions](#permissions).
4. Click **Create a remote**. The remote's QR code appears.
5. Have the speaker scan the QR code with their phone's camera. The remote opens on the
   phone.
6. Click **Done**.

The remote's QR code shows only until you click **Done**. If the speaker didn't manage to
scan it, reissue the code — see [Manage remotes](#manage-remotes).

![The Speaker remote panel: the Name field, the permissions with Next, Back, and Hide text
selected, the Create a remote button, and in the list the remote “Speaker”
connected](../img/en/remote-panel.png)

If the remote doesn't open on the phone, see
[If a phone doesn't open the page](viewers.md#if-a-phone-doesnt-open-the-page).

## What the speaker sees

![The remote on a phone: at the top, the verse on screen now; below, the Choose a verse…
button, the operator's preview with a To screen button, the next verse, and the Hide text
button; at the bottom, the large Back and Next buttons](../img/en/phone-remote.png)

On the remote:

- **On screen** — what the viewers see now.
- **Next** — what the next press of the **Next →** button will show.
- **← Back** and **Next →** at the bottom step through the show the same way as the arrow
  keys in the control window: verses, pages, and song slides.
- The other buttons depend on the remote's permissions.

At the top of the remote are its name and the connection state: the response time in
milliseconds, or “no connection, reconnecting”. On Android the phone vibrates briefly on
every press.

At the top right is the theme button. Each press switches between **As on the phone** (the
default), **Light**, and **Dark**; the choice is kept on that phone.

If a Bluetooth clicker is connected to the phone, it steps through the show too: →, ↓,
PageDown, and Space — **Next**; ←, ↑, and PageUp — **Back**; and Enter, with the
**To screen** permission, — **To screen**.

## Permissions

Each permission is turned on separately for each remote:

| Permission          | What the speaker can do                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| **Next**, **Back**  | step through the show                                                           |
| **Hide text**       | hide the text and bring it back                                                 |
| **Black screen**    | turn the black screen on and off                                                |
| **To screen**       | put on screen what the operator prepared in the preview (the **Preview** block) |
| **Choosing verses** | choose a verse on the phone                                                     |
| **Songs**           | choose a song and a stanza                                                      |
| **Running order**   | see the running order, show the next item, add the own choice to it             |

## The speaker's choice

With the **Choosing verses** or **Songs** permission, the speaker finds what they need on
the phone: they tap **Choose a verse…** (or **Choose a song…**), choose a translation, a
book, a chapter, and a verse, or a song and a stanza, and then tap **To preview**. A book
with one chapter, such as 3 John, needs no chapter choice: its verses open at once. With the
**To screen** permission they can tap **To screen** straight away, and with the
**Running order** permission, **+ To the running order**.

A verse can also be found by search, as in the control window. In the field above the books
(**Book, reference, or words…**), type a reference such as `John 3:16`, or words from the
text. The books that match stay at the top, and **Verses** appear below them: first from the
remote's translations, and when there is nothing there — from all of them (then “Nothing in
the remote’s translations — found in others” stands above them). The same verse from
different translations is one row. Tap a row and the chapter opens at that verse; a reference
also opens with the Enter key.

The choice becomes the speaker's own preview — the **Your preview** block. Now **Next** and
**Back** step through it, and the operator's selection in the control window doesn't change.
To step along with the operator again, the speaker taps ✕ in the **Your preview** block.

While the speaker steps through their own preview, a **Remote** monitor with the phone's
choice appears in the control window. With the buttons on that monitor the operator can put
the choice on screen or go to that place in their own verse list.

## Suggest to the speaker

The operator can send the speaker what is in the preview: a verse or a song slide. To
suggest it, click the **Suggest to a remote** icon on the preview monitor. The icon is there
when the remote is connected and has the needed permission: **Choosing verses** for a verse
or **Songs** for a song slide.

The **The operator suggests** block appears on the remote with a **To preview** button, and
with the **To screen** permission a **To screen** button too. The speaker decides: take the
suggestion or dismiss it with ✕.

## Manage remotes

The created remotes are listed in the **Speaker remote** panel below the **Remotes**
divider. Next to each are its state (**connected**, **not connected**, or
**not connected yet**) and permissions.

In a remote's row:

- To change the permissions, click the **What this remote may do** icon and select what you
  need. The phone gets the changes at once; no new QR code is needed.
- To give a new QR code — for example, the remote goes to another person — click
  **Reissue the code** and confirm with **Reissue**. The phone with the old code loses
  control at once.
- To take control back, click the trash icon **Revoke**. There is no confirmation: the
  phone loses control at once and shows “The remote is unavailable”.

The **Remember remotes after a server restart** switch is on by default: remotes keep
working after the app restarts. The app keeps only a hash of the code, in the
`data/secrets.json` file, not the code itself. If you turn the switch off, a restart revokes
every remote.

## What's next

- [Viewers' phones](viewers.md): the text on viewers' phones.
- [Running order](running-order.md): the program the speaker can see from the remote.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
