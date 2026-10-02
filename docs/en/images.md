# Images

[Українською](../images.md) · English

This page is for the operator: how to show a poster, an announcement, or a photo on screen
and add an image to the running order. To show a logo between the items of a show, see
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
screen; a larger one becomes its first frame, still. Save an iPhone's HEIC photo as JPEG
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

The last twenty deleted images stay in the `data/images/.trash/` folder. A running-order item
whose image was deleted shows a black slide.
