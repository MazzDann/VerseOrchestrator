import { Badge, createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Broadcast-console palette: a calm graphite base with ONE muted steel-blue accent for
 * selection/focus, and tally colours reserved for output state — `live` (red, "on air",
 * what the audience sees now) and `cue` (amber, preview/queued). Nothing else in the
 * operator UI should be colourful, so a glance tells what is on screen.
 */
const brand: MantineColorsTuple = [
  '#eef2f8',
  '#dbe3f0',
  '#b6c6e0',
  '#8fa8cf',
  '#7090c2',
  '#5b7fb9',
  '#4c6fa9',
  '#3e5d91',
  '#324b75',
  '#26395a',
];

/** Graphite (replaces Mantine's neutral dark): [0] text … [4] borders … [7] body. */
const dark: MantineColorsTuple = [
  '#e4e2dd',
  '#c4c3bf',
  '#8f9196',
  '#6c6f75',
  '#3a3e45',
  '#30343a',
  '#272a30',
  '#1e2025',
  '#18191d',
  '#111215',
];

/** Tally red — the output is live. Use only for "on screen" state and the go-live action. */
const live: MantineColorsTuple = [
  '#fdeceb',
  '#f9d4d2',
  '#f2a8a4',
  '#eb7a74',
  '#e5534c',
  '#e03f37',
  '#cf342d',
  '#b02a24',
  '#93221d',
  '#761a16',
];

/** Tally amber — preview / queued / next. */
const cue: MantineColorsTuple = [
  '#fff6e3',
  '#feebc4',
  '#fcd68a',
  '#f9c050',
  '#f5ae2a',
  '#f2a213',
  '#d88f0c',
  '#b37508',
  '#8f5d06',
  '#6b4504',
];

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  autoContrast: true,
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: '600',
  },
  colors: { brand, dark, live, cue },
  components: {
    // Mantine badges are uppercase + tracked by default — too loud for a dense console.
    Badge: Badge.extend({
      styles: { root: { textTransform: 'none', letterSpacing: 0, fontWeight: 500 } },
    }),
  },
});
