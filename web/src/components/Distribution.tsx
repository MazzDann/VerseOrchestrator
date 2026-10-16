import { useRef } from 'react';
import { Button, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload } from '@tabler/icons-react';
import { fmtNumber, tr, useLang } from '../i18n';
import { download } from '../lib/bench/files';
import { quantiles } from '../lib/bench/report';

/** One measured thing: its timed runs (ms). */
export interface DistRow {
  label: string;
  times: number[];
}
/** A query or a payload, with a row per engine / transport. */
export interface DistGroup {
  label: string;
  rows: DistRow[];
}

const LABEL_W = 200;
const PLOT_W = 600;
const VALUE_W = 70;
const ROW_H = 18;
const GROUP_H = 22;
const AXIS_H = 28;
const W = LABEL_W + PLOT_W + VALUE_W;

const fmtMs = (ms: number) =>
  fmtNumber(ms, { maximumFractionDigits: ms < 1 ? 2 : ms < 10 ? 1 : 0 });

/**
 * Timed runs as box plots on a log scale (1.18.0-beta.6, «Графіки для дипломної»): the box is the
 * middle half (p25–p75), the line in it the median, the whisker from the fastest run to p95 — the
 * slow tail beyond it as dots. One hue; what a row is, its label says (no colour legend). The
 * median stands beside each row; the hover gives the five numbers. SVG and PNG for the thesis.
 */
export function Distribution({ groups, fileName }: { groups: DistGroup[]; fileName: string }) {
  useLang();
  const ref = useRef<SVGSVGElement>(null);
  const all = groups
    .flatMap((g) => g.rows.flatMap((r) => r.times))
    .filter((t) => t > 0 && Number.isFinite(t));
  if (all.length === 0) return null;
  const lo = 10 ** Math.floor(Math.log10(Math.min(...all)));
  // at least one decade: every run equal to a power of ten would leave no width to draw in (review)
  const hi = Math.max(10 ** Math.ceil(Math.log10(Math.max(...all))), lo * 10);
  const x = (ms: number) =>
    LABEL_W +
    ((Math.log10(Math.max(ms, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * PLOT_W;
  const ticks: number[] = [];
  for (let t = lo; t <= hi * 1.0001; t *= 10) ticks.push(t);

  let y = 4;
  const parts: React.ReactNode[] = [];
  for (const g of groups) {
    parts.push(
      <text key={`g-${g.label}`} x={0} y={y + 14} className="vo-dist-group">
        {g.label}
      </text>,
    );
    y += GROUP_H;
    for (const r of g.rows) {
      const times = r.times.filter((t) => t > 0 && Number.isFinite(t));
      const top = y;
      y += ROW_H;
      if (times.length === 0) continue;
      const q = quantiles(times);
      const mid = top + ROW_H / 2;
      const tail = times.filter((t) => t > q.p95);
      parts.push(
        <g key={`${g.label}-${r.label}`}>
          <title>
            {tr('{name}: найшвидше {min}, медіана {median}, p95 {p95}, найдовше {max} мс', {
              name: r.label,
              min: fmtMs(q.min),
              median: fmtMs(q.median),
              p95: fmtMs(q.p95),
              max: fmtMs(q.max),
            })}
          </title>
          <rect x={0} y={top} width={W} height={ROW_H} className="vo-dist-hit" />
          <text x={12} y={mid + 4} className="vo-dist-label">
            {r.label}
          </text>
          <line x1={x(q.min)} x2={x(q.p95)} y1={mid} y2={mid} className="vo-dist-whisker" />
          <rect
            x={x(q.p25)}
            y={mid - 5}
            width={Math.max(2, x(q.p75) - x(q.p25))}
            height={10}
            rx={2}
            className="vo-dist-box"
          />
          <line
            x1={x(q.median)}
            x2={x(q.median)}
            y1={mid - 7}
            y2={mid + 7}
            className="vo-dist-median"
          />
          {tail.map((t, i) => (
            <circle key={i} cx={x(t)} cy={mid} r={2} className="vo-dist-tail" />
          ))}
          <text x={W - 4} y={mid + 4} textAnchor="end" className="vo-dist-value">
            {fmtMs(q.median)}
          </text>
        </g>,
      );
    }
  }
  const plotH = y;
  const H = plotH + AXIS_H;

  /** The chart as a file: the theme's colours written in (a file has no CSS variables). */
  const svgText = () => {
    const svg = ref.current!;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    const from = [svg, ...svg.querySelectorAll('*')];
    const to = [copy, ...copy.querySelectorAll('*')];
    from.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const t = to[i] as SVGElement;
      t.removeAttribute('class');
      t.setAttribute('fill', cs.fill);
      t.setAttribute('stroke', cs.stroke);
      if (cs.strokeWidth) t.setAttribute('stroke-width', cs.strokeWidth);
      if (el.tagName === 'text') {
        t.setAttribute('font-family', cs.fontFamily);
        t.setAttribute('font-size', cs.fontSize);
        t.setAttribute('font-weight', cs.fontWeight);
      }
    });
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // a size of its own: opened alone, and as an image to draw (Firefox draws none without, review)
    copy.setAttribute('width', String(W));
    copy.setAttribute('height', String(H));
    const bg = getComputedStyle(document.body).backgroundColor;
    copy.insertAdjacentHTML('afterbegin', `<rect width="100%" height="100%" fill="${bg}"/>`);
    return new XMLSerializer().serializeToString(copy);
  };
  const savePng = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, W, H);
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${fileName}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    };
    img.onerror = () =>
      notifications.show({
        message: tr('Не вдалося зберегти графік як PNG — збережіть SVG'),
        color: 'red',
      });
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText())}`;
  };

  return (
    <div>
      <div className="vo-dist">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={tr('Розподіл часу: медіана, p25–p75, p95')}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={plotH} className="vo-dist-grid" />
              <text x={x(t)} y={plotH + 16} textAnchor="middle" className="vo-dist-tick">
                {fmtMs(t)}
              </text>
            </g>
          ))}
          <text x={LABEL_W + PLOT_W} y={plotH + 16} dx={14} className="vo-dist-tick">
            {tr('мс')}
          </text>
          {parts}
        </svg>
      </div>
      <Group gap="xs" mt={6}>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconDownload size={14} />}
          onClick={() => download(`${fileName}.svg`, svgText(), 'image/svg+xml')}
        >
          {tr('Графік SVG')}
        </Button>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconDownload size={14} />}
          onClick={savePng}
        >
          {tr('Графік PNG')}
        </Button>
      </Group>
    </div>
  );
}
