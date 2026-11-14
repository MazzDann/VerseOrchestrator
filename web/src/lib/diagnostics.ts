import { api } from '../api';
import { useSettings } from '../settingsStore';
import { useNoticeHistory } from './noticeHistory';
import { currentOutputs } from './outputs';
import { inDesktop } from './desktop';

/** Settings keys of the operator's own content: never in a report (texts, places, presets). */
const PRIVATE = ['recentTexts', 'savedTexts', 'history', 'bookmarks', 'presets'] as const;

/**
 * The control window's part of «Діагностика для відгуку» (1.22.0-beta.5, users' F1107-05): the
 * browser or the app, the screen, the output windows, this session's notices, and the settings
 * as the switches stand — without the operator's texts, places, pictures (an image is said by
 * whether it is there) and its own words on the cover.
 */
export function controlWindowReport(): Record<string, unknown> {
  const state = JSON.parse(JSON.stringify(useSettings.getState())) as Record<string, unknown>;
  for (const k of PRIVATE) {
    const v = state[k];
    state[k] = Array.isArray(v) ? `${v.length} item(s)` : v === undefined ? undefined : '…';
  }
  const ap = state.appearance as Record<string, unknown> | undefined;
  if (ap) {
    for (const k of ['bgImage', 'coverImage']) ap[k] = ap[k] ? 'set' : null;
    // the operator's own words in the look: the cover's text, the countdown's caption (review)
    for (const k of ['coverText', 'countdownCaption'])
      if (typeof ap[k] === 'string') ap[k] = ap[k] ? 'set' : '';
  }
  const desk = (window as unknown as { voDesktop?: Record<string, unknown> }).voDesktop;
  return {
    version: __APP_VERSION__,
    made: new Date().toISOString(),
    shell: inDesktop() ? { electron: desk?.version, platform: desk?.platform } : 'browser',
    userAgent: navigator.userAgent,
    languages: navigator.languages,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio,
      window: [window.innerWidth, window.innerHeight],
    },
    outputs: currentOutputs().map((o) => ({
      kind: o.kind,
      bounds: o.bounds,
      view: o.view,
      fullscreen: o.fullscreen,
      visible: o.visible,
    })),
    notices: useNoticeHistory.getState().entries.map((n) => ({
      at: new Date(n.at).toISOString(),
      color: n.color,
      ...(n.title ? { title: n.title } : {}),
      text: n.text,
    })),
    settings: state,
  };
}

/** Make the .zip and hand it to the browser (or the app) to save. */
export async function saveDiagnostics(): Promise<void> {
  const { blob, name } = await api.diagnostics(controlWindowReport());
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
