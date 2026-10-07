import { tr } from '../i18n';

/** A «Заставка» item's name in the list (1.10.0-beta.2): its text's first line, or «Заставка». */
export const coverLabel = (text: string): string =>
  text.trim().split('\n')[0]?.trim().slice(0, 60) || tr('Заставка');
