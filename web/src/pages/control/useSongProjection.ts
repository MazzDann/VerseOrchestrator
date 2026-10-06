import { type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { notifications } from '@mantine/notifications';
import { mainText, markedText, unmark } from '@vo/shared';
import { type SongStyle } from '../../api';
import { type TextItem } from '../../settingsStore';
import {
  type Slide,
  type SlideLine,
  type SlideSource,
  type SlideStyle,
  type SlideTemplate,
} from '../../presenterBus';
import { type Outcome } from '../../lib/commands';
import { tr } from '../../i18n';
import { withSecond } from './songSlides';

/**
 * A song stanza or free text on screen (vo-songs): `projectText` (faithful or in the app's
 * style), `projectAnnouncement`, and the end of a song. The song panel's state stays in
 * Control. No effects.
 */
export function useSongProjection({
  slideStyle,
  slideTemplate,
  pushLive,
  setPreviewOverride,
  setLive,
  pushRecentText,
  leaderRef,
  liveSlideRef,
  afterToggle,
}: {
  slideStyle: SlideStyle;
  slideTemplate: SlideTemplate | null;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  pushRecentText: (item: TextItem) => void;
  leaderRef: MutableRefObject<boolean>;
  liveSlideRef: MutableRefObject<Slide>;
  afterToggle: (s: Slide) => void;
}) {
  // Project a text slide (song stanza). With `faithful`, reproduce the pptx look
  // (its background/colour/font/bold + a positioned quote box, anchored as in the file, and
  // a second box of its own — a title slide's authors, 1.2.1); else use the app style.
  // `look` is the stanza's own style in either mode: its second part (1.3.0) keeps the
  // file's colour with `faithful`, and goes dimmer in the app style.
  const projectText = (
    text: string,
    reference: string,
    faithful?: SongStyle | null,
    source?: SlideSource,
    look?: SongStyle | null,
  ) => {
    if (!text.trim()) return;
    let style = slideStyle;
    let template = slideTemplate;
    let quote = text;
    let subline: string | undefined;
    let line: SlideLine = { translationAbbr: '', text, rtl: false };
    if (faithful) {
      style = {
        ...slideStyle,
        font: faithful.font,
        color: faithful.color,
        align: faithful.align,
        bgColor: faithful.bg,
        bgImage: null,
        redLetter: false,
        bold: faithful.bold,
      };
      template = {
        name: 'pptx',
        objects: [
          {
            kind: 'quote',
            visible: true,
            x: faithful.x,
            y: faithful.y,
            w: faithful.w,
            h: faithful.h,
            align: faithful.align,
            valign: faithful.anchor,
            // Original pptx font size (cqh) → render the stanza "as made", not auto-fit.
            size: faithful.size,
          },
          ...(faithful.sub
            ? [
                {
                  kind: 'subline' as const,
                  visible: true,
                  x: faithful.sub.x,
                  y: faithful.sub.y,
                  w: faithful.sub.w,
                  h: faithful.sub.h,
                  align: faithful.sub.align,
                  valign: faithful.sub.anchor,
                  size: faithful.sub.size || 4, // unknown size: a caption's
                  color: faithful.sub.color,
                },
              ]
            : []),
        ],
      } satisfies SlideTemplate;
      if (faithful.sub) {
        quote = mainText(text, faithful);
        subline = faithful.sub.text;
      }
      line = { ...line, text: quote };
      const second = faithful.second;
      if (second && unmark(second.text) === quote)
        line = withSecond(line, second.text, second.color);
    } else {
      const marked = markedText(text, look);
      if (marked) line = withSecond(line, marked);
    }
    const slide: Slide = {
      lines: [line],
      ...(subline ? { subline } : {}),
      reference,
      blank: false,
      visible: true,
      style,
      template,
      source,
    };
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    if (reference) {
      notifications.show({
        message: tr('На екрані: {ref}', { ref: reference }),
        color: 'live',
        autoClose: 1500,
      });
    }
  };

  // Project a free-text slide (announcement / note / custom text) and keep it in recents.
  const projectAnnouncement = (title: string, body: string) => {
    if (!body.trim()) return;
    projectText(body, title.trim());
    pushRecentText({ title, body });
    if (!title.trim()) {
      notifications.show({ message: tr('Текст на екрані'), color: 'live', autoClose: 1500 });
    }
  };

  // «Далі» after a song's last stanza (0.6.24): an empty slide — the stanza's text goes, its
  // background stays (the same slide, hidden, as «Сховати текст»); «Назад» or any stanza
  // brings text back. Only over a song: after a song the screen shows nothing to read.
  const songEnd = (): Outcome => {
    if (!leaderRef.current) return { ok: false, reason: tr('Показом керує інше вікно керування') };
    const s = liveSlideRef.current;
    if (s.source?.kind !== 'song' || !s.visible) {
      return { ok: false, reason: tr('На екрані не пісня — ховати нічого') };
    }
    if (s.blank || s.forceBlack) return { ok: true }; // nothing to read already
    const next: Slide = { ...s, blank: true };
    pushLive(next);
    afterToggle(next);
    return { ok: true };
  };
  return {
    projectText,
    projectAnnouncement,
    songEnd,
  };
}
