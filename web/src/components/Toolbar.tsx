import type { ReactNode } from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Indicator,
  Kbd,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { formatChord } from '../hotkeys';

/**
 * Header toolbar primitives. Every control gets one unique name (tooltip + aria-label)
 * and, when it has a rebindable hotkey, shows the CURRENT binding — so the toolbar
 * doubles as a hotkey cheat-sheet without hardcoding "F5" anywhere.
 */

/** Tooltip body: the action name, an optional hint line, and the current hotkey(s). */
function Tip({ label, hint, combo }: { label: string; hint?: string; combo?: string }) {
  const chords = (combo ?? '').split(',').filter(Boolean);
  return (
    <Stack gap={2}>
      <Group gap={8} wrap="nowrap" justify="space-between">
        <Text size="xs" fw={500}>
          {label}
        </Text>
        {chords.length > 0 && (
          <Group gap={4} wrap="nowrap">
            {chords.map((c) => (
              <Kbd key={c} size="xs">
                {formatChord(c)}
              </Kbd>
            ))}
          </Group>
        )}
      </Group>
      {hint && (
        <Text size="xs" c="dimmed" maw={240}>
          {hint}
        </Text>
      )}
    </Stack>
  );
}

interface ToolProps {
  /** Unique action name — tooltip title and aria-label. */
  label: string;
  hint?: string;
  /** Current keymap entry (e.g. `keymap.blank`), shown as key caps. */
  combo?: string;
  icon: ReactNode;
  onClick: () => void;
  /** Toggle state for panel buttons (filled when open). */
  active?: boolean;
  color?: string;
  disabled?: boolean;
  /** Something new behind this button (a newer version behind the settings, 1.0.0). */
  dot?: boolean;
}

/** Icon-only toolbar button. */
export function ToolIcon({
  label,
  hint,
  combo,
  icon,
  onClick,
  active,
  color,
  disabled,
  dot,
}: ToolProps) {
  return (
    <Tooltip label={<Tip label={label} hint={hint} combo={combo} />} withArrow openDelay={250}>
      <Indicator disabled={!dot} size={8} offset={4} color="brand" withBorder>
        <ActionIcon
          variant={active ? 'filled' : 'default'}
          color={color ?? 'brand'}
          size="lg"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
        >
          {icon}
        </ActionIcon>
      </Indicator>
    </Tooltip>
  );
}

/** Text + icon toolbar button; collapses to an icon when `compact`. */
export function ToolButton({
  label,
  text,
  compact,
  variant = 'default',
  ...rest
}: ToolProps & { text: string; compact?: boolean; variant?: 'default' | 'filled' | 'light' }) {
  if (compact) return <ToolIcon label={label} {...rest} active={variant === 'filled'} />;
  const { hint, combo, icon, onClick, color, disabled } = rest;
  return (
    <Tooltip label={<Tip label={label} hint={hint} combo={combo} />} withArrow openDelay={250}>
      <Button
        variant={variant}
        color={color ?? 'brand'}
        size="sm"
        leftSection={icon}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {text}
      </Button>
    </Tooltip>
  );
}

/** A zone of related controls; zones are separated by a thin vertical rule. */
export function ToolZone({
  children,
  divider = true,
  label,
}: {
  children: ReactNode;
  divider?: boolean;
  /** Accessible name of the zone (not shown). */
  label: string;
}) {
  return (
    <>
      {divider && <Divider orientation="vertical" h={24} style={{ alignSelf: 'center' }} />}
      <Group gap={6} wrap="nowrap" role="group" aria-label={label}>
        {children}
      </Group>
    </>
  );
}
