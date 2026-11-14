import { useEffect, useRef, useState } from 'react';
import {
  TextInput,
  Textarea,
  ScrollArea,
  Stack,
  Text,
  Box,
  Group,
  Button,
  ActionIcon,
  Tooltip,
  Switch,
  Divider,
} from '@mantine/core';
import {
  IconLetterT,
  IconDeviceTv,
  IconTrash,
  IconPlaylistAdd,
  IconQuote,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconHeading,
  IconSeparatorHorizontal,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
} from '@tabler/icons-react';
import { QuoteSearch } from './QuoteSearch';
import { useSettings, type TextItem } from '../settingsStore';
import { N_, tr, useLang } from '../i18n';
import { pageAt, type RichAlign } from '../lib/richText';
import { insertDivider, markLines, surround, type Edit, type LineKind } from '../lib/richEdit';
import { IS_MAC } from '../hotkeys';

interface Props {
  open: boolean;
  /** changes when the operator picks «Текст на екран»: the caret goes to the text */
  focusKey?: number;
  /**
   * Project a free-text slide: `title` becomes the reference line, `body` the quote — read as
   * «Багатий текст» (lib/richText.ts) — and `align` its own alignment (none = the look's).
   */
  onProject: (title: string, body: string, align?: RichAlign, slides?: boolean) => void;
  /**
   * The text as it is typed, into the preview (1.22.0-beta.2, F1107-09): `page` — the slide the
   * caret is in when it goes in slides.
   */
  onPreview?: (
    title: string,
    body: string,
    align: RichAlign | undefined,
    slides: boolean,
    page: number,
  ) => void;
  /** Add the composed text to the presentation sequence. */
  onAddToPlaylist?: (item: {
    title: string;
    body: string;
    align?: RichAlign;
    slides?: boolean;
  }) => void;
}

const ALIGNS: { value: RichAlign; label: string; icon: typeof IconAlignLeft }[] = [
  { value: 'left', label: N_('Ліворуч'), icon: IconAlignLeft },
  { value: 'center', label: N_('По центру'), icon: IconAlignCenter },
  { value: 'right', label: N_('Праворуч'), icon: IconAlignRight },
];

/**
 * Free-text slide composer — announcements, notes, any custom text. Reuses the
 * active slide style/template; keeps a recents list so repeat texts are one click.
 */
export function TextPanel({ open, focusKey = 0, onProject, onPreview, onAddToPlaylist }: Props) {
  useLang();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // the text's own alignment (1.22.0-beta.1): none = the look's
  const [align, setAlign] = useState<RichAlign | undefined>(undefined);
  // «Абзаци — окремими слайдами» (1.22.0-beta.2, F1107-08): kept with the text, like its alignment
  const [slides, setSlides] = useState(false);
  // where the caret is: the preview shows its slide (F1107-09)
  const [caret, setCaret] = useState(0);
  const wrap = useSettings((s) => s.textWrap);
  const setWrap = useSettings((s) => s.setTextWrap);
  const recentTexts = useSettings((s) => s.recentTexts);
  const removeRecentText = useSettings((s) => s.removeRecentText);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // «Цитати з Вікіцитат» (1.19.0-beta.10)
  const [quotesOpen, setQuotesOpen] = useState(false);

  // the caret goes in when the operator picks «Текст на екран» (`focusKey` changes) — not when a
  // running order item opens it: the show's keys would stop at the field (review, 1.8.12-beta.7)
  useEffect(() => {
    if (!focusKey) return;
    const t = setTimeout(() => bodyRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [focusKey]);

  // F1107-09 («прев’ю тексту коли пишеш»): the text as typed goes into the preview after a short
  // pause — never to the screen; an empty field leaves the preview as it is. Only once the operator
  // works on the text here: a panel opened again over an old draft leaves the preview (and the
  // verses following «Наживо») alone (review)
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const touched = useRef(false);
  useEffect(() => {
    if (!open) touched.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || !touched.current || !body.trim()) return;
    const t = setTimeout(
      () => previewRef.current?.(title, body, align, slides, slides ? pageAt(body, caret) : 0),
      250,
    );
    return () => clearTimeout(t);
  }, [open, title, body, align, slides, caret]);

  if (!open) return null;

  const project = () => {
    if (!body.trim()) return;
    onProject(title, body, align, slides);
  };

  const loadRecent = (t: TextItem) => {
    touched.current = true;
    setTitle(t.title);
    setBody(t.body);
    setAlign(t.align);
    setSlides(!!t.slides);
  };
  // Enter or a double click on a past text shows it, as «На екран» does (F1107-15); a click or
  // Space only brings it back into the fields to edit
  const showRecent = (t: TextItem) => {
    loadRecent(t);
    onProject(t.title, t.body, t.align, t.slides);
  };

  // «Багатий текст» (1.22.0-beta.1, F1107-14): the toolbar writes the Markdown the screen reads
  // (lib/richEdit.ts) and puts the selection back
  const apply = (make: (text: string, start: number, end: number) => Edit) => {
    const el = bodyRef.current;
    if (!el) return;
    const e = make(el.value, el.selectionStart, el.selectionEnd);
    touched.current = true;
    setBody(e.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(e.start, e.end);
    });
  };
  const mark = (m: string) => apply((t, a, b) => surround(t, a, b, m));
  const chord = IS_MAC ? '⌘' : 'Ctrl+';
  const lines = (kind: LineKind) => apply((t, a, b) => markLines(t, a, b, kind));
  const tools: { label: string; icon: typeof IconBold; run: () => void }[] = [
    { label: tr('Жирний ({key})', { key: `${chord}B` }), icon: IconBold, run: () => mark('**') },
    { label: tr('Курсив ({key})', { key: `${chord}I` }), icon: IconItalic, run: () => mark('*') },
    { label: tr('Рядок-заголовок'), icon: IconHeading, run: () => lines('heading') },
    { label: tr('Список'), icon: IconList, run: () => lines('bullet') },
    { label: tr('Нумерований список'), icon: IconListNumbers, run: () => lines('number') },
    {
      label: tr('Лінія-розділювач'),
      icon: IconSeparatorHorizontal,
      run: () => apply((t, a) => insertDivider(t, a)),
    },
  ];

  return (
    // «Текст на екран» is a kind of «Медіа» since 1.8.12-beta.7 (the author: no sense apart)
    <div className="vo-workspace">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap">
          <IconLetterT size={18} />
          <Text fw={600} size="sm">
            {tr('Текст на екран')}
          </Text>
        </Group>
        <Tooltip label={tr('Цитати з Вікіцитат — з автором (потрібен інтернет)')} withArrow>
          <ActionIcon
            size="input-xs"
            variant={quotesOpen ? 'filled' : 'light'}
            onClick={() => setQuotesOpen((o) => !o)}
            aria-label={tr('Цитати з Вікіцитат…')}
            aria-pressed={quotesOpen}
          >
            <IconQuote size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {quotesOpen && (
        <QuoteSearch
          onClose={() => setQuotesOpen(false)}
          onPick={(quote) => {
            // the quote is the text, its author and the site the reference line
            touched.current = true;
            setBody(quote.text);
            setTitle(quote.credit);
            setQuotesOpen(false);
            setTimeout(() => bodyRef.current?.focus(), 30);
          }}
        />
      )}
      <Stack gap="xs">
        <TextInput
          size="sm"
          placeholder={tr('Заголовок (необов’язково)')}
          value={title}
          onChange={(e) => {
            touched.current = true;
            setTitle(e.currentTarget.value);
          }}
        />
        <Group gap={4} wrap="wrap" role="toolbar" aria-label={tr('Форматування тексту')}>
          {tools.map(({ label, icon: Icon, run }) => (
            <Tooltip key={label} label={label} withArrow openDelay={300}>
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={label} onClick={run}>
                <Icon size={16} />
              </ActionIcon>
            </Tooltip>
          ))}
          <Divider orientation="vertical" mx={4} />
          {ALIGNS.map(({ value, label, icon: Icon }) => (
            <Tooltip
              key={value}
              label={
                align === value
                  ? tr('{label} — ще раз: як у вигляді', { label: tr(label) })
                  : tr(label)
              }
              withArrow
              openDelay={300}
            >
              <ActionIcon
                size="sm"
                variant={align === value ? 'light' : 'subtle'}
                color={align === value ? 'brand' : 'gray'}
                aria-label={tr(label)}
                aria-pressed={align === value}
                onClick={() => {
                  touched.current = true;
                  setAlign((a) => (a === value ? undefined : value));
                }}
              >
                <Icon size={16} />
              </ActionIcon>
            </Tooltip>
          ))}
          <Group gap="sm" ml="auto" wrap="wrap">
            <Tooltip
              label={tr('Порожній рядок починає новий слайд; «Далі» показує наступний')}
              withArrow
              openDelay={300}
              multiline
              w={240}
            >
              <Switch
                size="xs"
                label={tr('Абзаци — окремими слайдами')}
                checked={slides}
                onChange={(e) => {
                  touched.current = true;
                  setSlides(e.currentTarget.checked);
                }}
              />
            </Tooltip>
            <Switch
              size="xs"
              label={tr('Переносити рядки')}
              checked={wrap}
              onChange={(e) => setWrap(e.currentTarget.checked)}
            />
          </Group>
        </Group>
        <Textarea
          ref={bodyRef}
          autosize
          minRows={3}
          maxRows={8}
          placeholder={tr(
            'Текст слайда — оголошення, примітка, довільний текст… **жирний**, *курсив*, - список',
          )}
          value={body}
          // «Переносити рядки» off: a long line runs on, so every Enter is where it shows (F1107-14)
          wrap={wrap ? 'soft' : 'off'}
          styles={wrap ? undefined : { input: { whiteSpace: 'pre', overflowX: 'auto' } }}
          onChange={(e) => {
            touched.current = true;
            setBody(e.currentTarget.value);
            setCaret(e.currentTarget.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+B and +I: bold and italic, as in a text editor
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
              const k = e.key.toLowerCase();
              if (k === 'b' || k === 'i') {
                e.preventDefault();
                e.stopPropagation();
                mark(k === 'b' ? '**' : '*');
                return;
              }
            }
            // Ctrl/Cmd+Enter projects without reaching for the mouse. It stops here: ⌘↩ is
            // also «На екран» on a Mac, and that document hotkey would put the verse
            // selection over this text.
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              project();
            }
          }}
        />
        <Group justify="flex-end" gap="xs">
          {onAddToPlaylist && (
            <Button
              size="sm"
              variant="default"
              leftSection={<IconPlaylistAdd size={16} />}
              disabled={!body.trim()}
              onClick={() =>
                onAddToPlaylist({
                  title,
                  body,
                  ...(align ? { align } : {}),
                  ...(slides ? { slides } : {}),
                })
              }
            >
              {tr('У показ')}
            </Button>
          )}
          <Button
            size="sm"
            color="live"
            leftSection={<IconDeviceTv size={16} />}
            disabled={!body.trim()}
            onClick={project}
          >
            {tr('На екран')}
          </Button>
        </Group>
      </Stack>
      {recentTexts.length > 0 && (
        <>
          <Text size="10px" c="dimmed" fw={600} tt="uppercase" mt="sm" mb={4}>
            {tr('Нещодавні')}
          </Text>
          <ScrollArea style={{ flex: 1 }} scrollbars="y" className="vo-scroll-rows">
            <Stack gap={4}>
              {recentTexts.map((t) => (
                <Box
                  key={`${t.title}\n${t.body}`}
                  className="vo-verse-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => loadRecent(t)}
                  onDoubleClick={() => showRecent(t)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return; // the trash button's own keys
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!e.repeat) showRecent(t);
                    } else if (e.key === ' ') {
                      e.preventDefault();
                      loadRecent(t);
                    }
                  }}
                  style={{ position: 'relative' }}
                >
                  {t.title && (
                    <Text size="xs" fw={600} truncate>
                      {t.title}
                    </Text>
                  )}
                  <Text size="sm" c="dimmed" lineClamp={2} style={{ whiteSpace: 'pre-line' }}>
                    {t.body}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    style={{ position: 'absolute', top: 4, right: 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentText(t);
                    }}
                    aria-label={tr('Прибрати зі списку')}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Box>
              ))}
            </Stack>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
