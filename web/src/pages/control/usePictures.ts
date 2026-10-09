import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { notifications } from '@mantine/notifications';
import { type ImageInfo } from '../../api';
import { type NewSeqItem, type SeqImage } from '../../playlistStore';
import { type Slide, type SlidePicture, type SlideStyle } from '../../presenterBus';
import { pictureSlide } from '../../lib/slide';
import { tr } from '../../i18n';

/**
 * «Зображення» on screen (vo-media): a picture shown, re-fitted, deleted from under the screen,
 * added to the running order. No effects.
 */
export function usePictures({
  slideStyle,
  pushLive,
  setPreviewOverride,
  setLive,
  liveSlideRef,
  previewOverride,
  clearedRef,
  playlistAdd,
}: {
  slideStyle: SlideStyle;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  liveSlideRef: MutableRefObject<Slide>;
  previewOverride: Slide | null;
  clearedRef: MutableRefObject<Slide | null>;
  playlistAdd: (item: NewSeqItem) => void;
}) {
  // «Зображення» (1.5.0): a picture on screen, as a stanza is — the preview shows it too, and
  // «Наживо» leaves it until the verses are navigated
  const projectPicture = (picture: SlidePicture, quiet = false): Slide => {
    const slide = pictureSlide(picture, slideStyle);
    pushLive(slide);
    if (quiet) return slide; // a «Цикл» tick (1.10.4): the screen only
    setPreviewOverride(slide);
    setLive(true);
    notifications.show({
      message: tr('На екрані: {ref}', { ref: picture.name }),
      color: 'live',
      autoClose: 1500,
    });
    return slide;
  };
  // «Вписати / Заповнити» (1.7.1, the user's call): the picture on screen takes the switch at once
  // — quietly, it is the same picture. Only its fit changes: a black screen stays black (the
  // picture under it waits with the new fit); the preview follows when it shows that picture too
  const refitPicture = (fit: SlidePicture['fit']) => {
    const now = liveSlideRef.current;
    if (!now.picture || now.picture.fit === fit) return;
    pushLive({ ...now, picture: { ...now.picture, fit } });
    if (previewOverride?.picture?.src === now.picture.src)
      setPreviewOverride({ ...previewOverride, picture: { ...previewOverride.picture, fit } });
  };
  // a picture deleted in «Зображення» (1.7.2) leaves the screen with it — nothing shown points at a
  // file that is gone (a black screen stays black; «Заставка» over it gives back nothing)
  const pictureDeleted = (src: string) => {
    const now = liveSlideRef.current;
    if (now.picture?.src === src) {
      pushLive(
        now.forceBlack
          ? { lines: [], reference: '', blank: false, visible: true, forceBlack: true }
          : { lines: [], reference: '', blank: false, visible: false },
      );
      if (!now.forceBlack) setLive(false);
      clearedRef.current = null;
    } else if (now.returnTo?.picture?.src === src) pushLive({ ...now, returnTo: undefined });
    // what Esc took away can't come back as a picture that is gone
    if (clearedRef.current?.picture?.src === src) clearedRef.current = null;
    if (previewOverride?.picture?.src === src) setPreviewOverride(null);
  };
  const addImageToPlaylist = (img: ImageInfo, fit: SlidePicture['fit']) => {
    playlistAdd({
      kind: 'image',
      label: img.name,
      imageId: img.id,
      src: img.src,
      small: img.small,
      fit,
    });
    notifications.show({
      message: tr('Зображення додано у показ'),
      color: 'green',
      autoClose: 1200,
    });
  };
  const pictureOf = (it: SeqImage): SlidePicture => ({
    src: it.src,
    small: it.small,
    name: it.label,
    fit: it.fit,
  });
  return {
    projectPicture,
    refitPicture,
    pictureDeleted,
    addImageToPlaylist,
    pictureOf,
  };
}
