import { Select } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useSettings } from '../settingsStore';
import { useStore } from '../store';
import { setFor } from '../lib/subheadingSets';
import { tr, useLang } from '../i18n';

/** Mantine's Select reads '' as no value: the translation's own titles go by this one. */
const OWN = ':own';

/**
 * «Підзаголовки для UBIO» (1.16.0-beta.3, the author's choice «набір до перекладу»): the main
 * translation's own titles or a set from the modules — there only when the library has sets.
 */
export function SubheadingSetPicker() {
  useLang();
  const on = useSettings((s) => s.subheadings);
  const chosen = useSettings((s) => s.subheadingSets);
  const primaryId = useStore((s) => s.selectedTranslationIds[0] ?? null);
  const { data: translations } = useQuery({
    queryKey: ['translations'],
    queryFn: api.translations,
    enabled: on,
  });
  const { data: sets } = useQuery({
    queryKey: ['subheading-sets'],
    queryFn: api.subheadingSets,
    enabled: on,
  });
  const abbr = translations?.find((t) => t.id === primaryId)?.abbr;
  if (!on || !abbr || !sets?.length) return null;
  const value = setFor(abbr, chosen, sets) || OWN;
  return (
    <Select
      label={tr('Підзаголовки для {abbr}', { abbr })}
      description={tr(
        'Власні перекладу або набір із модулів. Набір, зроблений для іншої нумерації, може зсуватися в Псалмах.',
      )}
      data={[
        { value: OWN, label: tr('Власні перекладу') },
        ...sets.map((s) => ({ value: s.abbr, label: `${s.abbr} — ${s.title}` })),
      ]}
      value={value}
      onChange={(v) =>
        v != null && useSettings.getState().setSubheadingSet(abbr, v === OWN ? '' : v)
      }
      allowDeselect={false}
      searchable={sets.length > 8}
      nothingFoundMessage={tr('Нічого не знайдено')}
    />
  );
}
