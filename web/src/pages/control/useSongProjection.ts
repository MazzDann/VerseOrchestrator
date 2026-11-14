import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
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
import {
  hasMarkup,
  parseRich,
  plainOf,
  splitPages,
  type RichAlign,
  type RichText,
} from '../../lib/richText';

/**
 * A song stanza or free text on screen (vo-songs): `projectText` (faithful or in the app's
 * style), `projectAnnouncement`, and the end of a song. The song panel's state stays in
 * Control. No effects.
 */
export function useSongProjection({
  slideStyle,
  slideTemplate,
  liveFollow,
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
  /** «Наживо»: off → a stanza click only cues the preview; «На екран» / Enter show it (F1024-07) */
  liveFollow: boolean;
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
    // a «Цикл» tick (1.10.4, the Mac's round): the screen only — the caller decides the preview
    quiet = false,
    // the running order / loop show live whatever «Наживо» says; a panel click leaves it undefined
    // and follows «Наживо» — off = cue the preview only, «На екран» / Enter then show it (F1024-07)
    force?: boolean,
    // the own text (1.22.0-beta.1, F1107-14): read as «Багатий текст» (lib/richText.ts), with its
    // own alignment; a song's stanza never is. `slides` (1.22.0-beta.2, F1107-08): its paragraphs
    // are slides of their own — the first goes, «Далі / Назад» walk the rest (`stepText`).
    // `preview` (F1107-09): only into the preview, quietly — the text being typed
    markup?: { align?: RichAlign; slides?: boolean; preview?: boolean },
  ): Slide | undefined => {
    if (!text.trim()) return;
    if (markup?.slides && !source) {
      const pages = splitPages(text);
      if (pages.length > 1) {
        if (!markup.preview) textPages.current = { title: reference, align: markup.align, pages };
        text = pages[0];
        source = { kind: 'text', page: 0, total: pages.length };
      }
    }
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
    let rich: RichText | undefined;
    if (markup) {
      const blocks = parseRich(text);
      // the plain text always from the blocks: an escape alone (`\*`) leaves no backslash (review)
      line = { ...line, text: plainOf(blocks) };
      if (hasMarkup(blocks) || markup.align)
        rich = { blocks, ...(markup.align ? { align: markup.align } : {}) };
    }
    const slide: Slide = {
      lines: [line],
      ...(rich ? { rich } : {}),
      ...(subline ? { subline } : {}),
      reference,
      blank: false,
      visible: true,
      style,
      template,
      source,
    };
    if (markup?.preview) {
      setPreviewOverride(slide);
      return slide;
    }
    const goLive = force ?? liveFollow;
    if (goLive || quiet) pushLive(slide);
    if (quiet) return slide; // a loop tick: the screen only, the caller sets the preview
    setPreviewOverride(slide);
    if (goLive) {
      setLive(true);
      if (reference) {
        notifications.show({
          message: tr('На екрані: {ref}', { ref: reference }),
          color: 'live',
          autoClose: 1500,
        });
      }
    } else if (reference) {
      // «Наживо» off: cued into the preview, not shown — «На екран» (чи Enter) показує
      notifications.show({
        message: tr('У прев’ю: {ref} — «На екран», щоб показати', { ref: reference }),
        color: 'cue',
        autoClose: 2000,
      });
    }
    return slide;
  };

  /** The own text shown in slides (1.22.0-beta.2): its pages — what «Далі / Назад» walk. */
  const textPages = useRef<{ title: string; align?: RichAlign; pages: string[] } | null>(null);

  /**
   * «Далі / Назад» on an own text shown in slides (1.22.0-beta.2, F1107-08): its next / previous
   * paragraph from `from`, on screen when the text is (else into the preview, as «Наживо» says);
   * 'edge' past its first / last — the running order or a notice then; null: not this text.
   */
  const stepText = (dir: 1 | -1, from: number, total: number): 'moved' | 'edge' | null => {
    const t = textPages.current;
    if (!t || t.pages.length !== total) return null;
    const to = from + dir;
    if (to < 0 || to >= total) return 'edge';
    const onScreen = liveSlideRef.current.source?.kind === 'text';
    projectText(
      t.pages[to],
      t.title,
      null,
      { kind: 'text', page: to, total },
      null,
      false,
      onScreen ? true : undefined,
      { align: t.align },
    );
    return 'moved';
  };

  // Project a free-text slide (announcement / note / custom text) and keep it in recents.
  const projectAnnouncement = (
    title: string,
    body: string,
    align?: RichAlign,
    slides?: boolean,
  ) => {
    if (!body.trim()) return;
    // «Текст на екран»: show now, read as «Багатий текст» (1.22.0-beta.1), in slides (beta.2)
    projectText(body, title.trim(), null, undefined, null, false, true, { align, slides });
    pushRecentText({
      title,
      body,
      ...(align ? { align } : {}),
      ...(slides ? { slides } : {}),
    });
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
    // a document's last paragraph the same (1.17.0-beta.1)
    if ((s.source?.kind !== 'song' && s.source?.kind !== 'doc') || !s.visible) {
      return { ok: false, reason: tr('На екрані не презентація — ховати нічого') };
    }
    if (s.blank || s.forceBlack) return { ok: true }; // nothing to read already
    const next: Slide = { ...s, blank: true };
    pushLive(next);
    afterToggle(next);
    return { ok: true };
  };
  /**
   * The text being typed in «Текст на екран» into the preview (1.22.0-beta.2, F1107-09: «прев’ю
   * тексту коли пишеш»): the slide the caret is in, not shown, no notice.
   */
  const previewAnnouncement = (
    title: string,
    body: string,
    align: RichAlign | undefined,
    slides: boolean,
    page: number,
  ) => {
    if (!body.trim()) return;
    const pages = slides ? splitPages(body) : [body];
    const at = Math.min(page, pages.length - 1);
    // no `source`: a draft is no slide «Далі» walks — a text shown before keeps its own pages
    projectText(pages[at], title.trim(), null, undefined, null, false, undefined, {
      align,
      preview: true,
    });
  };
  return {
    projectText,
    projectAnnouncement,
    previewAnnouncement,
    stepText,
    songEnd,
  };
}
