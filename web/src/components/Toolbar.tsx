import {
  cloneElement,
  forwardRef,
  Fragment,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Indicator,
  Kbd,
  Menu,
  Stack,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import { IconCheck, IconDots } from '@tabler/icons-react';
import { formatChord } from '../hotkeys';
import { tr, useLang } from '../i18n';

/**
 * Header toolbar primitives. Every control gets one unique name (tooltip + aria-label)
 * and, when it has a rebindable hotkey, shows the CURRENT binding — so the toolbar
 * doubles as a hotkey cheat-sheet without hardcoding "F5" anywhere.
 */

/** The alternatives of a keymap entry (`f5,f2` → two key caps). */
const chordsOf = (combo?: string) => (combo ?? '').split(',').filter(Boolean);

/** Tooltip body: the action name, an optional hint line, and the current hotkey(s). */
function Tip({ label, hint, combo }: { label: string; hint?: string; combo?: string }) {
  const chords = chordsOf(combo);
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

/**
 * `multiline` (1.0.1): a tooltip is `nowrap` otherwise — the hint ran past its 240 px and off
 * the window by the header's right edge («Чорний екран»), the page grew a scrollbar, the header
 * shifted under the pointer, and the tooltip flickered on and off.
 */
const TIP_PROPS = { withArrow: true, openDelay: 250, multiline: true } as const;

export interface ToolProps {
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

/**
 * Icon-only toolbar button. `filled`: drawn filled without being a toggle — a go-live text
 * button squeezed to its icon («На екран» in the narrowest header) is no «pressed» panel.
 */
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
  filled,
}: ToolProps & { filled?: boolean }) {
  return (
    <Tooltip label={<Tip label={label} hint={hint} combo={combo} />} {...TIP_PROPS}>
      <Indicator disabled={!dot} size={8} offset={4} color="brand" withBorder>
        <ActionIcon
          variant={active || filled ? 'filled' : 'default'}
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
  if (compact) return <ToolIcon label={label} {...rest} filled={variant === 'filled'} />;
  const { hint, combo, icon, onClick, color, disabled } = rest;
  return (
    <Tooltip label={<Tip label={label} hint={hint} combo={combo} />} {...TIP_PROPS}>
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

/** A zone's tools in «Ще» (`ToolMore`): the zone's name and its tools as the toolbar has them. */
export interface ToolSection {
  label: string;
  tools: ToolProps[];
}

/**
 * One tool as a «Ще» item: the toolbar's name, icon (16 px, the menu is `sm`) and current
 * hotkey; an open panel shows a check, a disabled tool says why.
 */
function ToolMenuItem({
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
  const chords = chordsOf(combo);
  const small = isValidElement<{ size?: number }>(icon) ? cloneElement(icon, { size: 16 }) : icon;
  return (
    <Menu.Item
      className="vo-menu-item"
      data-active={active || undefined}
      color={color}
      disabled={disabled}
      onClick={onClick}
      leftSection={
        <Indicator disabled={!dot} size={6} offset={1} color="brand">
          {small}
        </Indicator>
      }
      rightSection={
        active || chords.length > 0 ? (
          <Group gap={4} wrap="nowrap">
            {active && <IconCheck size={14} aria-hidden />}
            {chords.map((c) => (
              <Kbd key={c} size="xs">
                {formatChord(c)}
              </Kbd>
            ))}
          </Group>
        ) : undefined
      }
    >
      {label}
      {active && <VisuallyHidden>{tr('(відкрито)')}</VisuallyHidden>}
      {disabled && hint && (
        <Text size="xs" c="dimmed" maw={240}>
          {hint}
        </Text>
      )}
    </Menu.Item>
  );
}

/** The «Ще» button: Menu.Target gives it the menu's click and aria props, the tooltip sits around it. */
const MoreButton = forwardRef<
  HTMLButtonElement,
  Omit<ComponentPropsWithoutRef<'button'>, 'color'> & {
    label: string;
    hint?: string;
    dot?: boolean;
    tipOff?: boolean;
  }
>(function MoreButton({ label, hint, dot, tipOff, ...others }, ref) {
  return (
    <Tooltip label={<Tip label={label} hint={hint} />} {...TIP_PROPS} disabled={tipOff}>
      <Indicator disabled={!dot} size={8} offset={4} color="brand" withBorder>
        <ActionIcon
          {...others}
          ref={ref}
          variant="default"
          color="brand"
          size="lg"
          aria-label={label}
        >
          <IconDots size={18} stroke={1.5} />
        </ActionIcon>
      </Indicator>
    </Tooltip>
  );
});

/**
 * «Ще» (Mac check of 1.4.1): the header zones that don't fit the window, one click away. The
 * items keep the toolbar's names, icons, current hotkeys and states; a dot on the button when
 * one of them has one (a newer version behind «Налаштування вигляду»).
 *
 * The menu owns the keyboard while it is open: its arrows, Esc and letters stop here, so ↓
 * doesn't also step the verses and Esc doesn't also clear the screen (the page's hotkeys
 * listen on `document`). Tab goes on to the focus trap.
 */
export function ToolMore({
  label,
  hint,
  sections,
  opened,
  onChange,
}: {
  label: string;
  hint?: string;
  sections: ToolSection[];
  opened: boolean;
  onChange: (opened: boolean) => void;
}) {
  useLang();
  const dot = sections.some((s) => s.tools.some((t) => t.dot));
  return (
    <Menu
      opened={opened}
      onChange={onChange}
      position="bottom-end"
      withinPortal
      shadow="md"
      // a low window (or a large root font): the menu ends at the window's edge and scrolls
      middlewares={{ flip: true, shift: true, inline: false, size: { padding: 8 } }}
    >
      <Menu.Target>
        <MoreButton label={label} hint={hint} dot={dot} tipOff={opened} />
      </Menu.Target>
      <Menu.Dropdown
        style={{ overflowY: 'auto' }}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') e.stopPropagation();
        }}
      >
        {sections.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <Menu.Divider />}
            <Menu.Label>{s.label}</Menu.Label>
            {s.tools.map((t) => (
              <ToolMenuItem key={t.label} {...t} />
            ))}
          </Fragment>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
