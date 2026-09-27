/** Saving benchmark results as files from the page. */

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A CSV file: UTF-8 with a BOM, or Excel opens the Cyrillic as mojibake. */
export const saveCsv = (name: string, csv: string) =>
  download(name, String.fromCharCode(0xfeff) + csv, 'text/csv;charset=utf-8');
