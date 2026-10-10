# Images

[Українською](../images.md) · English

This page is for the operator: how to show a poster, an announcement, or a photo on screen,
add an image to the running order, show the photos of a folder in turn, and show a video. To show a logo between the items of a show, see
[Set up the cover](appearance.md#set-up-the-cover).

The app keeps the images, so they work while the app is running (`start.cmd`,
`start.command`, or `./start.sh`). If the app's server isn't running (“in the browser” without
the server), the images panel says the app's server is needed.

## Add images

To add images:

1. At the top of the control window, click **Media**, then **Images** on the left. The
   images panel appears in the middle.
2. Click **Add…** and choose one or more PNG, JPEG, WebP, or GIF files.

Thumbnails appear in the panel, newest first. The app keeps each image in the
`data/images/` folder as two copies: one for the screen, at most 3840 pixels on its longer
side, and a small one, up to 1280 pixels, for the viewers' phones and the thumbnails. A
smaller file stays as it was. An animated GIF of up to 40 MB stays as it is too and moves on
screen; a larger one becomes its first frame, still. For the phones, Chrome and Edge turn a
GIF bigger than the small copy into a smaller moving one (up to 720 pixels and 4 MB); from
other browsers, the phones get its first frame, still. Save an iPhone's HEIC photo as JPEG
first: browsers can't open such photos, and the app says so.

You can also drag files into the control window from File Explorer or Finder: while you
drag them, the window says what will happen. Photos and pictures go to **Images**, a folder
becomes an album (see [Add a folder](#add-a-folder)), and videos go to **Videos** (see [Add a
video](#add-a-video)).

To rename an image, point at its thumbnail, click the pencil icon **Rename**, type the name,
and press Enter. Only the name in the app changes; the file stays as it was. Items of the
running order and of saved programs that carry the old name take the new one. Albums and
videos are renamed the same way.

## Show an image

To show an image, click its thumbnail. The thumbnail of the image on screen has a red frame,
like the **On screen** monitor.

The switch at the top of the panel says how an image takes the slide:

- **Fit** — the whole image shows, and the empty bands at its sides are black.
- **Fill** — the image takes the whole slide, and the edges that don't fit are cut off.

The switch applies at once to the image on screen, and to the one you show or add to the
running order after it. The viewers' phones show the small copy of the image.

To take an image off the screen, use the same actions as for text: see
[Take the text off the screen](show-text.md#take-the-text-off-the-screen).

## Add an image to the running order

To add an image to the [running order](running-order.md), point at its thumbnail and click
the **Add to the running order** icon. The item remembers how the image takes the slide:
**Fit** or **Fill**.

## Delete an image

To delete an image, point at its thumbnail and click the trash icon **Delete the image**. In
its place, “Deleted: …” appears with a **Cancel** button that brings the image back. You can
cancel until you delete another image or close the panel.

If the image is on screen, in the running order, or in a saved program, the app asks first and
says where. Click **Delete** to delete it anyway, or **Cancel** to keep it. An image on screen
leaves the screen with it.

The last twenty deleted images stay in the `data/images/.trash/` folder. A running-order item
whose image was deleted is marked “Image deleted: …” and shows a black slide.

## Show photos from a folder in turn

An album is a folder of photos on this computer. The app reads the photos right from the
folder and doesn't copy them, so photos you add to the folder later show up in the album
too.

### Add a folder

To add a folder as an album:

1. At the top, click **Media**, then choose **Albums** on the left.
2. Click **Add a folder…**.
3. Choose the folder: start from your home folder, the Pictures folder, or a drive, and open
   the folders inside. Or paste the folder's path into the field at the top and press Enter: the
   path may be in quotes, or start with `~` or `file://`. Below the list you see how many photos
   the folder has.
4. Click **Add this folder**. The album opens.

Or drag the folder into the control window. The browser doesn't tell where it lies on the
disk, so the app looks for a folder of that name with the same files in Pictures, on the
Desktop, in Downloads, Documents, OneDrive, and next to the other albums. One it finds is added
at once; if it finds none or several, the folder picker opens.

An album shows the JPEG, PNG, WebP, GIF, AVIF, and BMP photos right in the folder, by name:
“IMG_2” before “IMG_10”. The app doesn't show folders inside it or hidden files. The browser
can't open iPhone HEIC photos: the album says how many it left out.

### Show photos in turn

To show a photo, click its thumbnail. Then step through the album:

- with ← and → (and PageUp and PageDown), the ‹ and › buttons above the thumbnails, a clicker
  in the presentation window, or **Next** and **Back** on a speaker remote — while the album
  is open;
- by itself: in the **Change every … s** field, enter how many seconds each photo stays, and
  click **Start**.

The slideshow stops when you click **Pause**, press a key or a step button, show something
else, or reach the last photo. While the text is hidden or the screen is black, it waits.
Above the thumbnails you see which photo is on screen, for example “3 / 18”.

To have the album show photos you just added to the folder, click the **Refresh** icon.

The **Fit** / **Fill** switch works on an album's photos as it does on images. Viewers'
phones get a small copy of the photo, up to 1280 pixels: a big camera photo takes about
200 KB there instead of a few megabytes. The control window makes the small copies while the
album is open: first the photo on screen and the next two, then the rest, one photo at a time.
Until a photo has a small copy, the phones get the photo itself. The small copies are in the
`data/album-cache/` folder.

If another control window leads the show and you click **Take control**, this window opens the
album at the photo that is on screen. The slideshow is off then.

### Add an album to the running order

To add an album to the [running order](running-order.md), click the **Add to the running
order** icon next to the album in the list or above its thumbnails. The item opens the album
at its first photo, and you step through it from there as usual.

### Remove an album

To remove an album from the list, click the trash icon **Remove the album**, and then
**Remove**. The folder and the photos stay where they are, and you can add the folder again.
Items of the running order with this album are marked “Album removed: …”.

If the folder isn't there (a drive or a flash drive is disconnected), the album says “Folder
not found”. Connect the drive and click **Refresh**.

If the system doesn't let the app open the folder, the album says “No access to the folder”. On a
Mac this happens with Desktop, Documents, Downloads, flash drives, and network drives: open System
Settings → Privacy & Security → Files & Folders (or Full Disk Access), allow access for Terminal
or the app that starts VerseOrchestrator, and click **Refresh**. On other systems, check the
folder's permissions.

An album added on a computer with another system (the app folder carried on a flash drive from
Windows to a Mac, or back) stays in the list as “A folder from another computer: …”. It can't be
shown on this computer, and it works as before on the one it was added on. You can remove it like
any other album.

## Show a video

Videos are MP4, MOV, WebM, or MKV files on this computer. The app reads a file where it is
and doesn't copy it.

### Add a video

To add a video:

1. At the top, click **Media**, then choose **Videos** on the left.
2. Click **Add a video…**.
3. Open the folder with the video: start from your home folder or a drive, or paste the path to
   the folder or to the video itself into the field at the top and press Enter. Below the
   folders you see the folder's videos with their sizes; the pasted video is highlighted.
4. Click the video you need. It appears in the list.

Or drag the video into the control window: the app looks for a file of that name and size in
the usual folders (Videos, Desktop, Downloads…), and otherwise opens the folder picker.

The browser doesn't play AVI, WMV, and other formats: the app says how many of them the folder
has. Save such a video as MP4.

### Control the video on screen

To show a video, click its thumbnail. The video starts from the beginning. Above the
thumbnails, the buttons of the video on screen appear:

- **Start** / **Pause** — stop the video and go on from the same place;
- the slider — go to another place in the video; next to it you see the time, for example
  “0:12 / 4:30”;
- **Repeat** — start the video again when it ends;
- the volume slider — the sound's volume in the control window.

A video plays in the presentation window without sound, and the sound comes from the control
window — connect the hall's speakers to this computer. If you reloaded the control window
while a video was playing, click anywhere in it: the browser allows sound only after a click.

To choose what happens after a video ends, open **Settings** → **Video** → **After a video
ends**:

- **Black screen**;
- **Next** — the next item of the running order if the video started from it, otherwise the
  next video of the list.

Viewers' phones don't get the video. To choose what they show, use **Viewers' phones during a
video**: **A frame of the video** or **The words “Video on screen”**. The control window makes
the frame when the video appears in the list. The stage window shows how much of the video is
left.

### Add a video to the running order

To add a video to the [running order](running-order.md), hover over its thumbnail and click the
**Add to the running order** icon. The item plays the video from the beginning.

### Remove a video

To remove a video from the list, hover over its thumbnail, click the trash icon **Remove the
video**, and then **Remove**. The file stays where it is. If the file isn't there (a drive is
disconnected), the thumbnail says “File not found”. If the system doesn't let the app open the
file, the thumbnail says “No access to the file”: allow access as for an album, and click the
**Refresh the video list** icon.

A video added on a computer with another system (from Windows to a Mac, or back) stays in the
list as “A file from another computer: …”. It can't be shown here, and it plays as before on the
computer it was added on. You can remove it like any other video.
