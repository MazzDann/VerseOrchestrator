import { decodeText } from '../../documents/parse.js';

/** Is it UTF-8 or UTF-16 (a BOM), that is — nothing to guess? */
function isUnicode(bytes: Uint8Array): boolean {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
    return true;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * A module file's text: Unicode, else the old encoding it names (`said`), else Windows-1251 for a
 * Cyrillic text and Windows-1252 for a Latin one — told by how many of its letters are past ASCII.
 */
export function decodeModuleText(bytes: Uint8Array, said?: string): string {
  if (isUnicode(bytes)) return decodeText(bytes);
  if (said && !/^utf/i.test(said))
    try {
      return new TextDecoder(said).decode(bytes);
    } catch {
      // an encoding no decoder knows
    }
  let high = 0;
  let ascii = 0;
  for (const b of bytes) {
    if (b >= 0x80) high++;
    else if ((b >= 65 && b <= 90) || (b >= 97 && b <= 122)) ascii++;
  }
  return new TextDecoder(high > ascii ? 'windows-1251' : 'windows-1252').decode(bytes);
}

const head = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes.subarray(0, 1024));

/** An XML file's text: in the encoding it declares. */
export function decodeXmlFile(bytes: Uint8Array): string {
  return decodeModuleText(
    bytes,
    /<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(head(bytes))?.[1],
  );
}

/** A USFM file's text: `\ide CP1252`, `\ide 1250 - …` names a code page. */
export function decodeUsfmFile(bytes: Uint8Array): string {
  const page = /\\ide\s+(?:cp|windows-?)?(125\d)\b/i.exec(head(bytes))?.[1];
  return decodeModuleText(bytes, page && `windows-${page}`);
}
