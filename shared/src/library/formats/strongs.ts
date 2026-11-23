/**
 * The Strong numbers a tag's attribute gives («G1080», «strong:H07225», «b:H1254a», «H1,H2»): the
 * digits alone, as modules keep them. `extended`: five-digit Greek numbers whose last digit tells
 * the entry's part (G25320 = 2532), as some USFM texts number them.
 */
export function strongsOf(value: string, extended = false): number[] {
  const out: number[] = [];
  const re = /(?:^|[^A-Za-z0-9])([GH]?)(\d{1,5})(?=[a-zA-Z]?(?:[^A-Za-z0-9]|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    let n = Number.parseInt(m[2], 10);
    const greek = m[1].toUpperCase() === 'G';
    if (greek && m[2].length === 5 && (extended || n > 5624)) n = Math.floor(n / 10);
    if (n > 0 && n <= 9999 && !out.includes(n)) out.push(n);
  }
  return out;
}
