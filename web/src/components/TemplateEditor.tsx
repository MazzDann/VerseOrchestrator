import { Stack, Select, Text, Group, NumberInput, Switch, SegmentedControl, Badge } from '@mantine/core';
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
 * Slide-layout template editor: pick a preset, then nudge each object's box
 * (position/size in % of the slide), alignment, font size and visibility. The
 * active template is persisted; editing clones it so the presets stay pristine.
 */
export function TemplateEditor() {
  const template = useSettings((s) => s.slideTemplate);
  const setTemplate = useSettings((s) => s.setSlideTemplate);

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
        label="Шаблон розкладки"
        data={TEMPLATE_PRESETS.map((p, i) => ({ value: String(i), label: p.label }))}
        value={String(activeIdx)}
        onChange={(v) => v != null && pick(Number(v))}
        allowDeselect={false}
      />

      {template ? (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Позиції й розміри — у % від слайда. Зміни зберігаються автоматично.
          </Text>
          {template.objects.map((o, i) => (
            <div
              key={i}
              style={{
                border: '1px solid var(--mantine-color-default-border)',
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
                        value={o.align}
                        onChange={(v) =>
                          updateObj(i, { align: v as 'left' | 'center' | 'right' })
                        }
                        data={[
                          { label: '◀', value: 'left' },
                          { label: '■', value: 'center' },
                          { label: '▶', value: 'right' },
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
          Класичний центрований показ. Обери інший шаблон, щоб розставити об'єкти (де цитата,
          риска, підпис, посилання) і пропорції.
        </Text>
      )}
    </Stack>
  );
}
