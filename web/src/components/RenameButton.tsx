import { useState } from 'react';
import { ActionIcon, Button, Group, Popover, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil } from '@tabler/icons-react';
import { tr, useLang } from '../i18n';

/**
 * «Перейменувати» (1.14.0-beta.1, the author's Q16): a picture's, an album's or a video's name in
 * the app — the files on disk keep theirs. A pencil opens a small field with the name selected;
 * Enter or «Зберегти» keeps it, Esc leaves it.
 */
export function RenameButton({
  name,
  onRename,
  size = 'sm',
  variant = 'default',
}: {
  name: string;
  /** keeps the new name (the server's answer); throws with the reason in words */
  onRename: (name: string) => Promise<void>;
  size?: 'xs' | 'sm';
  variant?: 'default' | 'subtle';
}) {
  useLang();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const next = value.trim();
    if (!next || next === name) return setOpen(false);
    setBusy(true);
    try {
      await onRename(next);
      setOpen(false);
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося перейменувати: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover
      opened={open}
      onChange={setOpen}
      position="bottom-end"
      withArrow
      shadow="md"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Tooltip label={tr('Перейменувати')} withArrow>
          <ActionIcon
            size={size}
            variant={variant}
            color="gray"
            onClick={(e) => {
              e.stopPropagation();
              setValue(name);
              setOpen((o) => !o);
            }}
            aria-label={tr('Перейменувати «{name}»', { name })}
          >
            <IconPencil size={14} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown w={260} onClick={(e) => e.stopPropagation()}>
        <TextInput
          size="xs"
          label={tr('Назва')}
          value={value}
          maxLength={120}
          data-autofocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button size="xs" variant="default" onClick={() => setOpen(false)}>
            {tr('Скасувати')}
          </Button>
          <Button size="xs" loading={busy} onClick={() => void save()}>
            {tr('Зберегти')}
          </Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
