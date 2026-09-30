import type { Lang } from '@vo/shared';

/**
 * The user guide (1.1.0, «Довідка»): docs/ in Ukrainian, docs/en/ in English, read on GitHub —
 * rendered, with its pictures, and the newest. Without the internet the same pages are Markdown
 * files in the app's docs/ folder.
 */
export const DOCS_URL = 'https://github.com/MazzDann/VerseOrchestrator/blob/main/docs';

/** A page of the guide in the interface language (the index by default). */
export const docsUrl = (lang: Lang, page = 'README.md'): string =>
  `${DOCS_URL}/${lang === 'en' ? 'en/' : ''}${page}`;
