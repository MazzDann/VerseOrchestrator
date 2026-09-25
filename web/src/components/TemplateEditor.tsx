import { useState } from 'react';
import {
  Stack,
  Select,
  Text,
  Group,
  NumberInput,
  Switch,
  SegmentedControl,
  Badge,
} from '@mantine/core';
import { IconAlignLeft, IconAlignCenter, IconAlignRight } from '@tabler/icons-react';
import { useSettings } from '../settingsStore';
import { TEMPLATE_PRESETS, type SlideObject, type SlideObjectKind } from '../presenterBus';

const KIND_LABEL: Record<SlideObjectKind, string> = {
  quote: 'Цитата',
  reference: 'Посилання',
  subline: 'Підпис',
  divider: 'Риска',
};

function NumField({
  label,
  value,
  onChange,
  max = 100,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  step?: number;
}) {
  return (
    <NumberInput
      size="xs"
      label={label}
      value={value}
      min={0}
      max={max}
      step={step}
      decimalScale={1}
      onChange={(v) => onChange(Number(v) || 0)}
      hideControls
    />
  );
}

/**
 * Schematic 16:9 map of the template: one outlined box per visible object, labelled by
 * kind. Hovering/focusing an object's editor highlights its box, so the numbers read as
 * places on the slide instead of abstract percentages.
 */
function LayoutMap({ objects, active }: { objects: SlideObject[]; active: number | null }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: 6,
        background: 'var(--mantine-color-default)',
        border: '1px solid var(--mantine-color-default-border)',
        overflow: 'hidden',
      }}
    >
      {objects.map((o, i) =>
        o.visible ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${o.x}%`,
              top: `${o.y}%`,
              width: `${o.w}%`,
              height: o.kind === 'divider' ? 2 : `${o.h}%`,
              minHeight: 2,
              border:
                o.kind === 'divider'
                  ? 'none'
                  : `1px ${i === active ? 'solid' : 'dashed'} var(--mantine-color-${
                      i === active ? 'brand-filled' : 'dimmed'
                    })`,
              background:
                o.kind === 'divider'
                  ? `var(--mantine-color-${i === active ? 'brand-filled' : 'dimmed'})`
                  : i === active
                    ? 'var(--mantine-color-brand-light)'
                    : undefined,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                o.align === 'left' ? 'flex-start' : o.align === 'right' ? 'flex-end' : 'center',
              padding: '0 4px',
              fontSize: 10,
              color: 'var(--mantine-color-dimmed)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {o.kind !== 'divider' && KIND_LABEL[o.kind]}
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * Slide-layout template editor: pick a preset, then nudge each object's box
 * (position/size in % of the slide), alignment, font size and visibility. The
 * active template is persisted; editing clones it so the presets stay pristine.
 */
export function TemplateEditor() {
  const template = useSettings((s) => s.slideTemplate);
  const setTemplate = useSettings((s) => s.setSlideTemplate);
  const [active, setActive] = useState<number | null>(null);

  const activeIdx = Math.max(
    0,
    TEMPLATE_PRESETS.findIndex((p) => (p.template?.name ?? null) === (template?.name ?? null)),
  );

  const pick = (idx: number) => {
    const t = TEMPLATE_PRESETS[idx].template;
    setTemplate(t ? structuredClone(t) : null);
  };

  const updateObj = (i: number, patch: Partial<SlideObject>) => {
    if (!template) return;
    setTemplate({
      ...template,
      objects: template.objects.map((o, j) => (j === i ? { ...o, ...patch } : o)),
    });
  };

  return (
    <Stack gap="sm">
      <Select
        label="Шаблон"
        data={TEMPLATE_PRESETS.map((p, i) => ({ value: String(i), label: p.label }))}
        value={String(activeIdx)}
        onChange={(v) => v != null && pick(Number(v))}
        allowDeselect={false}
      />

      {template ? (
        <Stack gap="xs">
          <LayoutMap objects={template.objects} active={active} />
          <Text size="xs" c="dimmed">
            Положення й розміри у % від слайда. Зміни зберігаються одразу.
          </Text>
          {template.objects.map((o, i) => (
            <div
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive((a) => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              style={{
                border: `1px solid var(--mantine-color-${active === i ? 'brand-filled' : 'default-border'})`,
                borderRadius: 6,
                padding: 8,
              }}
            >
              <Group justify="space-between" mb={4} wrap="nowrap">
                <Badge size="sm" variant="light">
                  {KIND_LABEL[o.kind]}
                </Badge>
                <Switch
                  size="xs"
                  label="Показувати"
                  checked={o.visible}
                  onChange={(e) => updateObj(i, { visible: e.currentTarget.checked })}
                />
              </Group>
              {o.visible && (
                <>
                  <Group gap={6} grow>
                    <NumField label="X" value={o.x} onChange={(v) => updateObj(i, { x: v })} />
                    <NumField label="Y" value={o.y} onChange={(v) => updateObj(i, { y: v })} />
                    <NumField label="Ширина" value={o.w} onChange={(v) => updateObj(i, { w: v })} />
                    <NumField
                      label={o.kind === 'divider' ? 'Товщина' : 'Висота'}
                      value={o.h}
                      max={o.kind === 'divider' ? 5 : 100}
                      step={o.kind === 'divider' ? 0.1 : 1}
                      onChange={(v) => updateObj(i, { h: v })}
                    />
                  </Group>
                  {o.kind !== 'divider' && (
                    <Group gap={6} mt={6} wrap="nowrap" align="flex-end">
                      {o.kind !== 'quote' && (
                        <NumField
                          label="Шрифт"
                          value={o.size}
                          max={20}
                          step={0.2}
                          onChange={(v) => updateObj(i, { size: v })}
                        />
                      )}
                      <SegmentedControl
                        size="xs"
                        aria-label={`Вирівнювання: ${KIND_LABEL[o.kind]}`}
                        value={o.align}
                        onChange={(v) => updateObj(i, { align: v as 'left' | 'center' | 'right' })}
                        data={[
                          {
                            label: <IconAlignLeft size={14} aria-label="Ліворуч" />,
                            value: 'left',
                          },
                          {
                            label: <IconAlignCenter size={14} aria-label="По центру" />,
                            value: 'center',
                          },
                          {
                            label: <IconAlignRight size={14} aria-label="Праворуч" />,
                            value: 'right',
                          },
                        ]}
                      />
                    </Group>
                  )}
                </>
              )}
            </div>
          ))}
        </Stack>
      ) : (
        <Text size="xs" c="dimmed">
          Класичний показ: текст по центру. Оберіть інший шаблон, щоб самостійно розставити цитату,
          риску, підпис і посилання.
        </Text>
      )}
    </Stack>
  );
}
