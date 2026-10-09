import { notifications } from '@mantine/notifications';
import { tr } from '../i18n';
import { OUTPUT_KIND_LABEL, type OutputKind } from './outputs';

/**
 * An output window that opened as a TAB of this very window (two screens on the test Windows,
 * 2026-10-10): LibreWolf by default puts even a sized pop-up into a tab
 * (browser.link.open_newwindow.restriction = 0), and a tab can't go to another screen until the
 * operator drags it out of the window. Told apart by this page going hidden at once — the tab
 * took its place; a window of its own leaves it visible (measured: LibreWolf 141 hidden 0.4 s
 * after the click; with pop-ups as windows, and in Edge, still visible after 1.5 s). The page
 * itself can't tell: LibreWolf's tab reports the pop-up's bars hidden and no opener. Said once,
 * when the operator comes back to this tab.
 */
type Doc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export function createTabWatch(
  show: (kind: OutputKind) => void,
  doc: Doc,
  after: (fn: () => void, ms: number) => void = (fn, ms) => void setTimeout(fn, ms),
  checkMs = 800,
) {
  let said = false;
  return (kind: OutputKind): void => {
    if (said) return;
    after(() => {
      if (said || doc.visibilityState !== 'hidden') return;
      const back = () => {
        if (doc.visibilityState !== 'visible') return;
        doc.removeEventListener('visibilitychange', back);
        if (said) return;
        said = true;
        show(kind);
      };
      doc.addEventListener('visibilitychange', back);
    }, checkMs);
  };
}

function showTabNotice(kind: OutputKind): void {
  notifications.show({
    id: 'output-opened-as-tab',
    color: 'orange',
    autoClose: 30_000,
    title: tr('{window}: вкладка, а не окреме вікно', { window: tr(OUTPUT_KIND_LABEL[kind]) }),
    message: tr(
      'Браузер відкрив його вкладкою цього вікна, тож на інший екран його не перенести. Перетягніть вкладку за межі вікна браузера — вона стане окремим вікном. У LibreWolf можна відкривати такі вікна окремо завжди: about:config → browser.link.open_newwindow.restriction = 2.',
    ),
  });
}

let watch: ((kind: OutputKind) => void) | null = null;

/** After an output window was opened from here: say so if it became a tab of this window. */
export function watchOpenedAsTab(kind: OutputKind): void {
  watch ??= createTabWatch(showTabNotice, document);
  watch(kind);
}
