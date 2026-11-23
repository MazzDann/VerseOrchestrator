import { useEffect, useState } from 'react';
import { Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import {
  SECTION_TITLES,
  SETTINGS_THEMES,
  themeOf,
  type SettingsSectionId,
  type SettingsThemeId,
} from '../lib/settingsSearch';
import { tr, useLang } from '../i18n';

/**
 * The settings' themes with their sections (1.25.4, the author: «розприділити на теми, і в цих темах
 * підпункти»): one theme unfolded, so the list fits beside any section without scrolling; a search
 * unfolds every theme it found something in.
 */
export function SettingsNav({
  pane,
  found,
  onPick,
}: {
  pane: SettingsSectionId;
  /** the sections a search keeps (null: no search) */
  found: Set<string> | null;
  onPick: (id: SettingsSectionId) => void;
}) {
  useLang();
  const [open, setOpen] = useState<SettingsThemeId | null>(themeOf(pane));
  useEffect(() => setOpen(themeOf(pane)), [pane]);
  return (
    <nav className="vo-settings-nav" aria-label={tr('Розділи налаштувань')}>
      {SETTINGS_THEMES.map((t) => {
        const unfolded = found ? t.sections.some((id) => found.has(id)) : open === t.id;
        return (
          <div key={t.id}>
            <button
              type="button"
              className="vo-list-item vo-settings-theme"
              aria-expanded={unfolded}
              data-settings-theme={t.id}
              onClick={() => {
                // out of a search: its first section
                if (found) return onPick(t.sections[0]);
                // a click on a theme shows its first section; on the one unfolded, folds it
                if (open === t.id) setOpen(null);
                else if (themeOf(pane) === t.id) setOpen(t.id);
                else onPick(t.sections[0]);
              }}
            >
              <IconChevronRight size={14} aria-hidden />
              {tr(t.title)}
            </button>
            {unfolded &&
              t.sections.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="vo-list-item"
                  data-selected={!found && pane === id ? 'true' : undefined}
                  data-found={found?.has(id) ? 'true' : undefined}
                  aria-current={!found && pane === id ? 'page' : undefined}
                  onClick={() => onPick(id)}
                >
                  {tr(SECTION_TITLES[id])}
                </button>
              ))}
          </div>
        );
      })}
    </nav>
  );
}

/** A theme's name over its sections in the narrow panel (the two panes have it in their list). */
export function ThemeHeading({ id, hidden }: { id: SettingsThemeId; hidden: boolean }) {
  useLang();
  if (hidden) return null;
  return (
    <Text size="xs" fw={600} c="dimmed" mt="sm">
      {tr(SETTINGS_THEMES.find((t) => t.id === id)!.title)}
    </Text>
  );
}
