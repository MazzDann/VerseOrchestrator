import { Component, useEffect, type ReactNode } from 'react';
import { tr, useLang } from '../i18n';
import type { OutputKind } from '../lib/outputs';

const OUTPUT_PAGES: Record<string, OutputKind> = { '/presenter': 'presenter', '/stage': 'stage' };

/**
 * An output window whose page broke outside a slide: black for the audience, still listed in
 * «Вікна виводу» (so it can be closed or moved from there), the reason sent to the control
 * window. The registry comes on demand — the entry every phone loads stays small — and if it
 * can't load either, the window just stays black.
 */
function BrokenOutput({ kind, message }: { kind: OutputKind; message: string }) {
  useEffect(() => {
    let stop: () => void = () => undefined;
    let gone = false;
    import('../lib/outputs')
      .then((m) => {
        if (!gone) stop = m.announceBrokenOutput(kind, message);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      stop();
    };
  }, [kind, message]);
  return <div style={{ position: 'fixed', inset: 0, background: '#000' }} />;
}

/** Plain markup, not Mantine components: they would move into the entry for this alone. */
function BrokenPage({ message }: { message: string }) {
  useLang();
  return (
    <div
      style={{
        maxWidth: 560,
        margin: '15vh auto 0',
        padding: 'var(--mantine-spacing-xl)',
        fontFamily: 'var(--mantine-font-family)',
        color: 'var(--mantine-color-text)',
      }}
    >
      <h3 style={{ margin: '0 0 var(--mantine-spacing-sm)' }}>
        {tr('Не вдалося показати сторінку')}
      </h3>
      <p
        style={{
          margin: '0 0 var(--mantine-spacing-md)',
          fontSize: 'var(--mantine-font-size-sm)',
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        {tr('Перезавантажте її. Причина: {error}', { error: message })}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          font: 'inherit',
          fontSize: 'var(--mantine-font-size-sm)',
          fontWeight: 600,
          padding: '6px 16px',
          border: 0,
          borderRadius: 'var(--mantine-radius-md)',
          background: 'var(--mantine-primary-color-filled)',
          color: 'var(--mantine-color-white)',
          cursor: 'pointer',
        }}
      >
        {tr('Перезавантажити')}
      </button>
    </div>
  );
}

class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const kind = OUTPUT_PAGES[window.location.pathname];
    return kind ? <BrokenOutput kind={kind} message={error} /> : <BrokenPage message={error} />;
  }
}

/**
 * The last line under every page (0.13.0): without it an error React can't render past
 * unmounts the whole page — a white window, on a projector too. Slides have their own guard
 * (SlideCanvas); this one catches the rest, e.g. a page's code that failed to load.
 */
export function PageGuard({ children }: { children: ReactNode }) {
  return <Guard>{children}</Guard>;
}
