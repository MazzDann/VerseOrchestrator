import { createBus, type BusChannel, type BusStorage, type Wire } from './lib/bus';

/**
 * Slides and the transport between the control window and the output windows.
 *
 * Abstraction boundary: the rest of the app only calls publishSlide / readSlide /
 * subscribeSlide (+ next, commands). The protocol lives in lib/bus.ts (1.3.1: versioned
 * messages, backgrounds sent once as assets, hello handshake); here it is bound to
 * BroadcastChannel + localStorage (same-origin, no server). To support a second device or
 * a desktop wrapper, give createBus another channel without touching the UI.
 */

export interface TextSpan {
  text: string;
  jesus?: boolean; // words of Jesus (red-letter)
  hot?: boolean; // emphasised word (e.g. the Strong word being projected)
}

export interface SlideLine {
  translationAbbr: string;
  text: string;
  rtl: boolean;
  /** Rich rendering (red-letter / highlighted word); falls back to `text` if absent. */
  segments?: TextSpan[];
}

export type PadUnit = 'px' | '%';

export interface SlideStyle {
  font: string;
  color: string;
  align: 'left' | 'center' | 'right';
  bgColor: string;
  bgImage: string | null;
  showVerseNumbers: boolean;
  padTop: number; // edge insets (in padUnit)
  padRight: number;
  padBottom: number;
  padLeft: number;
  padUnit: PadUnit;
  redLetter: boolean; // colour the words of Jesus
  jesusColor: string;
  highlightColor: string; // emphasised (hot) word colour
  bold?: boolean; // bold body text (e.g. faithful pptx song slides)
  /** how one slide gives way to the next (1.5.7); absent = smooth */
  transition?: SlideTransition;
  /** the viewers' QR (their /follow address) in a corner of every slide (1.5.16) */
  qrCorner?: string | null;
  /** how the viewers' QR is drawn (1.5.20); absent = square modules */
  qrStyle?: QrStyle;
}

/** The viewers' QR look (1.5.20): classic squares, rounded modules, or dots. */
export type QrStyle = 'square' | 'rounded' | 'dots';

/**
 * Slide change (1.5.7): `smooth` fades the old slide out, then the new one in (0.35 s each
 * — the new text appears ~0.37 s after the command, measured in 1.5.6); `fast` swaps at
 * once and fades the new one in over 0.15 s; `none` swaps instantly.
 */
export type SlideTransition = 'smooth' | 'fast' | 'none';

export type SlideObjectKind = 'quote' | 'reference' | 'subline' | 'divider';

/**
 * One positioned element of a slide template — VisioBible-style: geometry in % of
 * the slide so the preview and the full-screen presenter match. `quote` auto-fits
 * the verse text in its box; `reference`/`subline` use `size` (cqh) as a fixed
 * font size; `divider` is a thin line (`h` = thickness %).
 */
export interface SlideObject {
  kind: SlideObjectKind;
  visible: boolean;
  x: number; // % from the left edge
  y: number; // % from the top edge
  w: number; // % width
  h: number; // % height
  align: 'left' | 'center' | 'right';
  size: number; // font size in cqh (% of slide height); ignored for `quote` (auto-fit) and `divider`
  color?: string; // overrides the slide colour
  tiedToSubline?: boolean; // divider: render only when the slide has a subline
}

export interface SlideTemplate {
  name: string;
  objects: SlideObject[];
}

/**
 * Progressive reveal ("build"): show the quote one unit at a time. `units` is the
 * ordered list of lines (verses), `count` how many are revealed so far.
 * - accumulate: revealed units stay bright;
 * - spotlight: only the current (last revealed) unit is bright, earlier ones dim;
 * - placeholders: unrevealed units show faintly (else they're invisible but keep
 *   their space, so the layout/font never jumps as you reveal).
 */
export interface SlideReveal {
  units: string[];
  count: number;
  mode: 'accumulate' | 'spotlight';
  placeholders: boolean;
}

export interface Slide {
  lines: SlideLine[];
  reference: string;
  blank: boolean;
  visible: boolean;
  /**
   * Force a pure-black screen, ignoring the background image/colour. Distinct from
   * `blank`, which keeps the background and only drops the text (two-level blank).
   */
  forceBlack?: boolean;
  style?: SlideStyle;
  /** Optional secondary line under a divider (e.g. a Strong "word — gloss"). */
  subline?: string;
  /** Optional positioned layout. Absent/null → the default (legacy) centred layout. */
  template?: SlideTemplate | null;
  /** Progressive reveal state; absent → show the whole quote at once (default). */
  reveal?: SlideReveal | null;
  /** Where the slide comes from — so a control window that takes over stands on it. */
  source?: SlideSource;
  /** A QR slide («QR на екран», 1.5.16): the viewers' address as a big QR instead of text. */
  qr?: string;
}

/**
 * What produced a slide (1.4.10): the verse selection (with the page of a long passage
 * and the reveal step) or a song stanza. A control window that becomes the leader after
 * another one led (takeover / failover) puts its own selection there, so its first
 * «Далі» continues from the screen instead of from where that window was left. Output
 * windows ignore it; free text and black/empty screens carry none.
 */
export type SlideSource =
  | {
      kind: 'verses';
      translationIds: number[];
      bookNumber: number;
      chapter: number;
      /** the whole selection, not just the page on screen */
      verses: number[];
      page: number;
      reveal: number;
      /** put there by a speaker's remote (1.5.2) — its name */
      by?: string;
    }
  | { kind: 'song'; songId: number; stanza: number; by?: string };

/** Built-in layout presets. The first (null template) is the default centred look. */
export const TEMPLATE_PRESETS: { label: string; template: SlideTemplate | null }[] = [
  { label: 'Класичний (за замовчуванням)', template: null },
  {
    label: 'По центру з рискою',
    template: {
      name: 'По центру з рискою',
      objects: [
        { kind: 'quote', visible: true, x: 6, y: 5, w: 88, h: 66, align: 'center', size: 0 },
        {
          kind: 'divider',
          visible: true,
          x: 33,
          y: 75,
          w: 34,
          h: 0.4,
          align: 'center',
          size: 0,
          tiedToSubline: true,
        },
        { kind: 'subline', visible: true, x: 8, y: 77, w: 84, h: 10, align: 'center', size: 4 },
        { kind: 'reference', visible: true, x: 8, y: 90, w: 84, h: 7, align: 'center', size: 3.4 },
      ],
    },
  },
  {
    label: 'Нижня третина',
    template: {
      name: 'Нижня третина',
      objects: [
        { kind: 'quote', visible: true, x: 5, y: 58, w: 90, h: 27, align: 'left', size: 0 },
        { kind: 'subline', visible: false, x: 5, y: 85, w: 90, h: 6, align: 'left', size: 3 },
        { kind: 'divider', visible: false, x: 5, y: 86, w: 30, h: 0.4, align: 'left', size: 0 },
        { kind: 'reference', visible: true, x: 5, y: 90, w: 90, h: 6, align: 'left', size: 3 },
      ],
    },
  },
  {
    label: 'Мінімал',
    template: {
      name: 'Мінімал',
      objects: [
        { kind: 'quote', visible: true, x: 8, y: 12, w: 84, h: 66, align: 'center', size: 0 },
        { kind: 'subline', visible: false, x: 8, y: 80, w: 84, h: 8, align: 'center', size: 3.6 },
        { kind: 'divider', visible: false, x: 33, y: 79, w: 34, h: 0.4, align: 'center', size: 0 },
        { kind: 'reference', visible: true, x: 8, y: 86, w: 84, h: 7, align: 'center', size: 3.6 },
      ],
    },
  },
];

export const DEFAULT_STYLE: SlideStyle = {
  font: '"Lora", Georgia, "Times New Roman", serif',
  color: '#f4f4f6',
  align: 'center',
  bgColor: '#000000',
  bgImage: null,
  showVerseNumbers: false,
  padTop: 4,
  padRight: 4,
  padBottom: 4,
  padLeft: 4,
  padUnit: '%',
  redLetter: true,
  jesusColor: '#ff6b6b',
  highlightColor: '#ffd43b',
};

export const EMPTY_SLIDE: Slide = { lines: [], reference: '', blank: false, visible: false };

/**
 * Commands sent FROM an output window TO the control window: the operator drives the show
 * (advance, blank) with a clicker/keyboard while the output window on the second monitor
 * holds keyboard focus — the control window owns the selection, so the keypress must
 * travel back to it.
 */
export type PresenterCommand = 'next' | 'prev' | 'blank' | 'black';

// The default bus of this window: BroadcastChannel between same-origin windows,
// localStorage for cold start (protocol: lib/bus.ts).
const channel: BusChannel | null =
  typeof BroadcastChannel !== 'undefined'
    ? (() => {
        const bc = new BroadcastChannel('verse-orchestrator-v2');
        return {
          post: (msg) => bc.postMessage(msg),
          listen: (cb) => {
            const h = (e: MessageEvent) => cb(e.data as Wire);
            bc.addEventListener('message', h);
            return () => bc.removeEventListener('message', h);
          },
        };
      })()
    : null;

const storage: BusStorage | null =
  typeof localStorage !== 'undefined'
    ? {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v),
        remove: (k) => localStorage.removeItem(k),
      }
    : null;

const bus = createBus(channel, storage);

/** Project a slide: every output window shows it; the last one survives a reload. */
export const publishSlide = bus.publishSlide;
/** The last projected slide (cold start of an output window, or the control window). */
export const readSlide = bus.readSlide;
export const subscribeSlide = bus.subscribeSlide;
/** "Next slide" preview for the stage display — what advancing once would project. */
export const publishNext = bus.publishNext;
export const readNext = bus.readNext;
export const subscribeNext = bus.subscribeNext;
export const sendCommand = bus.sendCommand;
export const subscribeCommand = bus.subscribeCommand;
/** Leader / standby control window (lib/leader.ts): only the leader publishes. */
export const setPublishing = bus.setPublishing;
