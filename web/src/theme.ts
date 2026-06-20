import { createTheme, type MantineColorsTuple } from '@mantine/core';

const brand: MantineColorsTuple = [
  '#eef2ff',
  '#e0e7ff',
  '#c7d2fe',
  '#a5b4fc',
  '#818cf8',
  '#6366f1',
  '#4f46e5',
  '#4338ca',
  '#3730a3',
  '#312e81',
];

/** Refined theme: Inter for UI, indigo brand accent, soft radii. */
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
  colors: { brand },
});

/** Serif stack for projected scripture text. */
export const SCRIPTURE_FONT = '"Lora", Georgia, "Times New Roman", serif';
