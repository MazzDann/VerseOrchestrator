import { type MutableRefObject } from 'react';
import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { formatCombo } from '../../hotkeys';
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
  goTo: (q: string) => Promise<void>;
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
    if (keysRef.current?.(e)) return;
    const field = e.currentTarget;
    if (e.key === 'Enter') {
      e.preventDefault();
      void goTo(value);
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
