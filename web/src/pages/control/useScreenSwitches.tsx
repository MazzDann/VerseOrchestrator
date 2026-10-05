import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useSettings, type Appearance } from '../../settingsStore';
import { type Slide, type SlideStyle } from '../../presenterBus';
import { formatCombo } from '../../hotkeys';
import {
  coverOver,
  qrOver,
  sameContent,
  showsSomething,
  toggleBlack,
  toggleHidden,
  uncover,
} from '../../lib/slide';
import { tr, useLang } from '../../i18n';
import { standbyNotice } from './standby';

/** One «Екран очищено» notice at a time (0.13.2): a new clear replaces the last one. */
const CLEARED_NOTICE = 'screen-cleared';

/**
 * The switches over what is on screen (vo-sync): the viewers' QR, «Заставка», «Сховати текст»,
 * «Чорний екран», «Очистити» and taking it back — each gives back exactly the slide it covered.
 * No effects; `restoreRef` is assigned during render, as it was in Control.
 */
export function useScreenSwitches({
  leaderRef,
  liveSlideRef,
  pushLive,
  clearedRef,
  slideStyle,
  followUrl,
  appearance,
  versePreview,
  setLive,
  setPreviewOverride,
}: {
  leaderRef: MutableRefObject<boolean>;
  liveSlideRef: MutableRefObject<Slide>;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  clearedRef: MutableRefObject<Slide | null>;
  slideStyle: SlideStyle;
  followUrl: string;
  appearance: Appearance;
  versePreview: Slide;
  setLive: (live: boolean) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
}) {
  // the «Екран очищено» notice translates (the i18n guard: a .tsx that calls tr subscribes)
  useLang();
  // «QR на екран» (0.6.16): the viewers' QR as a slide; «Прибрати QR» brings back exactly
  // the slide it covered (not the selection — the operator may have browsed meanwhile). The
  // slide carries what it covers (lib/slide.ts `qrOver`, 1.4.2), so any control window that
  // leads now can give it back.
  const showQr = () => {
    const slide = qrOver(liveSlideRef.current, followUrl, slideStyle, tr('QR для глядачів'));
    pushLive(slide, { audience: false });
    setPreviewOverride(slide);
    setLive(true);
  };
  // «Заставка» (1.4.0): the logo and text from Налаштування вигляду → Заставка over whatever
  // is on screen; again — exactly the slide it covered (as «QR на екран» does, `coverOver`).
  // The phones get it without the image: an empty slide, «· · ·».
  const coverToggle = () => {
    if (!leaderRef.current) return standbyNotice();
    const now = liveSlideRef.current;
    if (!now.cover) {
      const cover = { text: appearance.coverText, image: appearance.coverImage };
      const slide = coverOver(now, cover, slideStyle, tr('Заставка'));
      pushLive(slide);
      setPreviewOverride(slide);
      setLive(true);
      if (!appearance.coverText && !appearance.coverImage) {
        notifications.show({
          message: tr(
            'Заставка поки порожня — лише фон. Додайте логотип чи текст: Налаштування вигляду → Заставка',
          ),
          color: 'gray',
          autoClose: 4000,
        });
      }
      return;
    }
    takeCoverOff();
  };
  /** «Заставка» (with «Відлік» too) off: exactly the slide it covered, or an empty screen. */
  const takeCoverOff = () => {
    const back = uncover(liveSlideRef.current);
    if (!back) {
      pushLive({ lines: [], reference: '', blank: false, visible: false, style: slideStyle });
      setLive(false);
      setPreviewOverride(null);
      return;
    }
    pushLive(back);
    afterToggle(back);
  };
  const hideQr = () => {
    const back = uncover(liveSlideRef.current);
    if (!back) {
      pushLive({ lines: [], reference: '', blank: false, visible: false, style: slideStyle });
      setLive(false);
      setPreviewOverride(null);
      return;
    }
    const restored: Slide = {
      ...back,
      style: { ...(back.style ?? slideStyle), qrCorner: slideStyle.qrCorner },
    };
    pushLive(restored);
    setLive(!restored.blank);
    // verses: live-follow picks up again on the next step; a song / text keeps the screen
    setPreviewOverride(restored.source?.kind === 'verses' ? null : restored);
  };
  // Remove the slide from the output. Drops out of live so the live-follow effect
  // doesn't immediately re-project the selection (pushLive's setLiveSlide re-renders,
  // which would re-run that effect).
  // «Очистити» can be taken back (0.13.2): the slide it removed stays at hand (`clearedRef`)
  // until something else goes on screen. Esc again keeps the screen empty — a panicked double
  // press must not bring back what was just cleared — so taking back is its own key
  // (Ctrl+Z / ⌘Z), the palette, or «Повернути» in the notice.
  const clearScreen = () => {
    const was = liveSlideRef.current;
    const takeBack = leaderRef.current && was.visible;
    pushLive({ lines: [], reference: '', blank: false, visible: false });
    setLive(false);
    if (!takeBack) return;
    clearedRef.current = was;
    notifications.hide(CLEARED_NOTICE);
    notifications.show({
      id: CLEARED_NOTICE,
      color: 'gray',
      autoClose: 6000,
      message: (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm">
            {tr('Екран очищено · {key} повертає', {
              key: formatCombo(useSettings.getState().keymap.restore),
            })}
          </Text>
          <Button size="compact-xs" variant="light" onClick={() => restoreRef.current()}>
            {tr('Повернути')}
          </Button>
        </Group>
      ),
    });
  };
  // «Сховати текст» / «Чорний екран» (0.6.18): switches over what is on screen — the same
  // slide comes back on the second press (lib/slide.ts). Hiding: the text fades, the
  // background and the corner QR stay (B). Black: an instant cut, everything (.).
  const afterToggle = (s: Slide) => {
    // «Заставка» counts (1.4.1): black or hidden over it and back used to read as nothing
    if (!showsSomething(s)) {
      setLive(false);
      return;
    }
    // back on screen: follow the selection again only if it is what came back
    const verses = s.source?.kind === 'verses';
    setLive(verses && sameContent(s, versePreview));
    setPreviewOverride(verses ? null : s);
  };
  const hideToggle = () => {
    if (!leaderRef.current) return standbyNotice();
    const next = toggleHidden(liveSlideRef.current);
    if (!next) {
      notifications.show({
        message: tr('На екрані нічого ховати'),
        color: 'gray',
        autoClose: 1200,
      });
      return;
    }
    pushLive(next);
    afterToggle(next);
    notifications.show(
      next.blank
        ? { message: tr('Текст сховано — фон лишається'), color: 'cue', autoClose: 1500 }
        : { message: tr('Текст знову на екрані'), color: 'live', autoClose: 1200 },
    );
  };
  const blackToggle = () => {
    if (!leaderRef.current) return standbyNotice();
    const next = toggleBlack(liveSlideRef.current);
    pushLive(next);
    afterToggle(next);
    notifications.show(
      next.forceBlack
        ? { message: tr('Чорний екран'), color: 'dark', autoClose: 1200 }
        : { message: tr('Чорний екран знято'), color: 'live', autoClose: 1200 },
    );
  };

  /** Take back «Очистити» (0.13.2): exactly the slide it removed, as the toggles do. */
  const restoreCleared = () => {
    if (!leaderRef.current) return standbyNotice();
    const back = clearedRef.current;
    notifications.hide(CLEARED_NOTICE);
    if (!back || liveSlideRef.current.visible) {
      clearedRef.current = null;
      notifications.show({
        message: tr('Немає чого повертати на екран'),
        color: 'gray',
        autoClose: 1200,
      });
      return;
    }
    pushLive(back);
    afterToggle(back);
    notifications.show({ message: tr('Знову на екрані'), color: 'live', autoClose: 1200 });
  };
  // the notice's button and the key run the latest one (it reads the current preview)
  const restoreRef = useRef(restoreCleared);
  restoreRef.current = restoreCleared;
  return {
    showQr,
    hideQr,
    coverToggle,
    takeCoverOff,
    afterToggle,
    hideToggle,
    blackToggle,
    clearScreen,
    restoreRef,
  };
}
