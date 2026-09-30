import { describe, expect, it } from 'vitest';
import { DOCS_URL, docsUrl } from './docs';

describe('the user guide link (1.1.0)', () => {
  it('opens the guide in the interface language', () => {
    expect(docsUrl('uk')).toBe(`${DOCS_URL}/README.md`);
    expect(docsUrl('en')).toBe(`${DOCS_URL}/en/README.md`);
    expect(docsUrl('en', 'install.md')).toBe(`${DOCS_URL}/en/install.md`);
    expect(DOCS_URL).toBe('https://github.com/MazzDann/VerseOrchestrator/blob/main/docs');
  });
});
