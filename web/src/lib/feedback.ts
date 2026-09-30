import type { Lang } from '@vo/shared';

/**
 * «Надіслати відгук» (1.2.0): the feedback form on GitHub (.github/ISSUE_TEMPLATE/feedback.yml),
 * with what a report needs filled in — the version, the system and browser, the interface
 * language — and nothing personal. The app sends nothing itself: the person reads the form and
 * submits it on GitHub, which keeps it as an issue (sign-in, spam, and safe rendering are
 * GitHub's), and no key of the project's is anywhere in the app.
 */
export const FEEDBACK_FORM = 'https://github.com/MazzDann/VerseOrchestrator/issues/new';

interface Brand {
  brand: string;
  version: string;
}
/** What `navigator` tells about the browser (userAgentData is Chromium's). */
export interface BrowserInfo {
  userAgent: string;
  userAgentData?: { platform?: string; brands?: Brand[] };
}

/** «Windows · Chrome 140», «macOS · Safari 18», «Android · Chrome 140» — or less when unknown. */
export function systemLine(nav: BrowserInfo = navigator as unknown as BrowserInfo): string {
  const ua = nav.userAgent ?? '';
  const os =
    nav.userAgentData?.platform ||
    (/Windows/i.test(ua)
      ? 'Windows'
      : /Android/i.test(ua)
        ? 'Android'
        : /iPhone|iPad/i.test(ua)
          ? 'iOS'
          : /Mac OS X|Macintosh/i.test(ua)
            ? 'macOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : '');
  // Chromium names itself next to the real brand and a made-up «Not A Brand»: take the real one
  const brands = (nav.userAgentData?.brands ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand));
  const brand = brands.find((b) => b.brand !== 'Chromium') ?? brands[0];
  let browser = brand
    ? `${brand.brand.replace(/^Google /, '').replace(/^Microsoft /, '')} ${brand.version}`
    : '';
  if (!browser) {
    const firefox = /Firefox\/(\d+)/.exec(ua);
    const safari = /Version\/(\d+)[\d.]* .*Safari/.exec(ua);
    browser = firefox ? `Firefox ${firefox[1]}` : safari ? `Safari ${safari[1]}` : '';
  }
  return [os, browser].filter(Boolean).join(' · ');
}

/** The form's address with the fields filled in (GitHub fills a form field from its id). */
export function feedbackUrl(o: { version: string; system: string; lang: Lang }): string {
  const q = new URLSearchParams({
    template: 'feedback.yml',
    version: o.version,
    system: o.system,
    language: o.lang,
  });
  return `${FEEDBACK_FORM}?${q}`;
}

/** Open the form in a new tab. */
export function openFeedback(lang: Lang): void {
  window.open(
    feedbackUrl({ version: __APP_VERSION__, system: systemLine(), lang }),
    '_blank',
    'noopener',
  );
}
