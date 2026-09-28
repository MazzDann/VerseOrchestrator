import { type Slide, type SlideSource } from '../presenterBus';

/** True when two slides show the same content (used to merge preview into the live monitor). */
export function sameContent(a: Slide, b: Slide): boolean {
  if ((a.reference ?? '') !== (b.reference ?? '') || a.lines.length !== b.lines.length)
    return false;
  if ((a.subline ?? '') !== (b.subline ?? '')) return false;
  return a.lines.every((l, i) => l.text === b.lines[i].text);
}

/**
 * Exactly the same slide (text, state, style, template, reveal)? The background image —
 * a data URL of up to ~1.5 MB — is compared on its own: the same string instance (the
 * appearance setting) is equal in O(1), so re-projecting never serializes it.
 */
export function sameSlide(a: Slide, b: Slide): boolean {
  if (a === b) return true;
  if ((a.style?.bgImage ?? null) !== (b.style?.bgImage ?? null)) return false;
  const rest = (s: Slide) =>
    JSON.stringify(s.style ? { ...s, style: { ...s.style, bgImage: null } } : s);
  return rest(a) === rest(b);
}

/** What a speaker remote needs to know about a slide — compact, no styling or images. */
export interface ScreenSummary {
  status: 'live' | 'blank' | 'black' | 'empty';
  reference: string;
  /** First line's text, capped — enough to recognise the slide on a phone. */
  text: string;
  font?: string;
  /** where it comes from (1.5.1): a remote knows whether its own cursor is on screen */
  source?: SlideSource;
}

export function summarize(slide: Slide | null | undefined): ScreenSummary {
  if (!slide) return { status: 'empty', reference: '', text: '' };
  const status: ScreenSummary['status'] = slide.forceBlack
    ? 'black'
    : slide.blank
      ? 'blank'
      : slide.visible && (slide.lines.length > 0 || !!slide.qr)
        ? 'live'
        : 'empty';
  return {
    status,
    reference: slide.reference ?? '',
    text: slide.qr ? 'QR для глядачів' : (slide.lines[0]?.text ?? '').slice(0, 400),
    font: slide.style?.font,
    source: slide.source,
  };
}
