# Images

[Українською](../images.md) · English

This page is for the operator: how to show a poster, an announcement, or a photo on screen,
add an image to the running order, and show the photos of a folder in turn. To show a logo between the items of a show, see
[Set up the cover](appearance.md#set-up-the-cover).

The app keeps the images, so they work while the app is running (`start.cmd`,
`start.command`, or `./start.sh`). If the app's server isn't running (“in the browser” without
the server), the images panel says the app's server is needed.

## Add images

To add images:

1. At the top of the control window, click the **Images** icon. The images panel appears
   above the verses.
2. Click **Add…** and choose one or more PNG, JPEG, WebP, or GIF files.

Thumbnails appear in the panel, newest first. The app keeps each image in the
`data/images/` folder as two copies: one for the screen, at most 3840 pixels on its longer
side, and a small one, up to 1280 pixels, for the viewers' phones and the thumbnails. A
smaller file stays as it was. An animated GIF of up to 40 MB stays as it is too and moves on
screen; a larger one becomes its first frame, still. For the phones, Chrome and Edge turn a
GIF bigger than the small copy into a smaller moving one (up to 720 pixels and 4 MB); from
other browsers, the phones get its first frame, still. Save an iPhone's HEIC photo as JPEG
first: browsers can't open such photos, and the app says so.

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

1. In the images panel, at the top, choose **Albums**.
2. Click **Add a folder…**.
3. Choose the folder: start from your home folder, the Pictures folder, or a drive, and open
   the folders inside. Or paste the folder's path into the field at the top and press Enter.
   Below the list you see how many photos the folder has.
4. Click **Add this folder**. The album opens.

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
phones get the photo from the folder as it is, without a small copy, so a big camera photo
takes a few megabytes on a phone.

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
