import { type MutableRefObject } from 'react';
import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { formatCombo } from '../../hotkeys';
import { searchEnter } from '../../lib/quickRef';
import { useSettings } from '../../settingsStore';
import { tr, useLang } from '../../i18n';

/**
 * The one search field (1.8.12-beta.4): references go, words show results under it. Its own
 * component since 1.8.12-beta.9 (A1007-01 — the author's ask): the settings put it in the header
 * (before or after the modes, or in the middle) or above the verses in «Біблія».
 */
export function SearchField({
  fieldRef,
  value,
  setValue,
  goTo,
  clearSearch,
  keysRef,
  focusKey,
  width,
  hidden,
}: {
  fieldRef: MutableRefObject<HTMLInputElement | null>;
  value: string;
  setValue: (value: string) => void;
  /** `show`: and put the place gone to on screen (⌘↩ / Ctrl+Enter) */
  goTo: (q: string, opts?: { show?: boolean }) => Promise<void>;
  clearSearch: () => void;
  /** the results panel's keys (↑ ↓ Enter Esc) — the field hands them over first */
  keysRef: MutableRefObject<((e: React.KeyboardEvent) => boolean) | null>;
  /** the key that puts the cursor here (`keymap.searchFocus`), shown in the placeholder */
  focusKey: string;
  width: number | string;
  hidden?: boolean;
}) {
  useLang();
  /**
   * The field's keys: the results panel's first (↑ ↓ Enter Esc); Enter else goes (a reference,
   * numbers in the open book, the first hit); Esc clears; in an EMPTY field the arrows and
   * PageUp / PageDown keep stepping the show — the field lets go and hands the key on.
   */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // the field owns Enter (Mac check of 1.9.0): ⌘↩ also reached the page's «На екран», which put
    // the old selection on screen — with ⌘ / Ctrl it now goes and shows the place gone to
    const enter = searchEnter(e, useSettings.getState().keymap.project);
    if (enter) e.stopPropagation();
    if (keysRef.current?.(e)) return;
    const field = e.currentTarget;
    if (enter) {
      e.preventDefault();
      void goTo(value, enter);
    } else if (e.key === 'Escape' && value) {
      e.preventDefault();
      e.stopPropagation();
      clearSearch();
    } else if (
      value === '' &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)
    ) {
      e.preventDefault();
      field.blur();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: e.key,
          code: e.code,
          // Shift+PageDown: the running order's next item (1.8.12-beta.6)
          shiftKey: e.shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  };
  return (
    <TextInput
      ref={fieldRef}
      size="sm"
      w={width}
      display={hidden ? 'none' : undefined}
      placeholder={tr('Пошук: Ів 3:16, любов ({key})', { key: formatCombo(focusKey) })}
      value={value}
      onChange={(e) => setValue(e.currentTarget.value)}
      onKeyDown={onKey}
      leftSection={<IconSearch size={14} />}
      aria-label={tr('Пошук або посилання')}
    />
  );
}
