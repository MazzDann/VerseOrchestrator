import { describe, expect, it } from 'vitest';
import { SECOND_CLOSE, SECOND_OPEN } from '@vo/shared';
import { type SlideLine } from '../../presenterBus';
import { withSecond } from './songSlides';

const line: SlideLine = { translationAbbr: '', text: 'Слава (слава) Богу', rtl: false };
const marked = `Слава ${SECOND_OPEN}(слава)${SECOND_CLOSE} Богу`;

describe('withSecond', () => {
  it("keeps the file's colour for the second part, as exact pieces", () => {
    expect(withSecond(line, marked, '#ffff00')).toEqual({
      ...line,
      segments: [{ text: 'Слава ' }, { text: '(слава)', color: '#ffff00' }, { text: ' Богу' }],
      exact: true,
    });
  });

  it('makes the second part dimmer without a colour', () => {
    expect(withSecond(line, marked).segments).toEqual([
      { text: 'Слава ' },
      { text: '(слава)', soft: true },
      { text: ' Богу' },
    ]);
  });

  it('leaves the line as it is when the marked text is not its text', () => {
    const other = `Інше ${SECOND_OPEN}(слово)${SECOND_CLOSE}`;
    expect(withSecond(line, other, '#ffff00')).toBe(line);
  });
});
