import { describe, expect, it } from 'vitest';
import { fileNameFor, imageAddressOf, looksLikeAddress } from './webImage';

const drag = (data: Record<string, string>) => ({
  types: Object.keys(data),
  getData: (t: string) => data[t] ?? '',
});

describe('pictures from the internet (1.19.0-beta.3, F1017-16)', () => {
  it('a drag from a page: the <img> it carried, else the link', () => {
    expect(
      imageAddressOf(
        drag({
          'text/html':
            '<a href="https://x.org/post"><img alt="" src="https://x.org/i.jpg?a=1&amp;b=2"></a>',
          'text/uri-list': 'https://x.org/post',
        }),
      ),
    ).toBe('https://x.org/i.jpg?a=1&b=2');
    expect(imageAddressOf(drag({ 'text/uri-list': '# comment\r\nhttps://x.org/a.png\r\n' }))).toBe(
      'https://x.org/a.png',
    );
    expect(imageAddressOf(drag({ 'text/plain': 'hello' }))).toBeNull();
  });
  it('an address is one http(s) or data:image text', () => {
    expect(looksLikeAddress(' https://x.org/a.png ')).toBe(true);
    expect(looksLikeAddress('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(looksLikeAddress('Ів 3:16')).toBe(false);
    expect(looksLikeAddress('https://x.org/a.png and more')).toBe(false);
    expect(looksLikeAddress('file:///C:/a.png')).toBe(false);
  });
  it('the file name agrees with the type', () => {
    expect(fileNameFor('sun.png', 'image/jpeg')).toBe('sun.jpg');
    expect(fileNameFor('photo', 'image/webp')).toBe('photo.webp');
    expect(fileNameFor('x.bin', 'application/octet-stream')).toBe('x.bin');
  });
});
