import { type CSSProperties } from 'react';
import { type SlideStyle } from '../presenterBus';
import { type RichAlign, type RichSpan, type RichText } from '../lib/richText';

/** A line's spans: bold, italic. */
function Spans({ spans }: { spans: RichSpan[] }) {
  if (spans.length === 0) return <>{' '}</>; // an empty line keeps its height
  return (
    <>
      {spans.map((s, k) => (
        <span
          key={k}
          style={{
            fontWeight: s.b ? 800 : undefined,
            fontStyle: s.i ? 'italic' : undefined,
          }}
        >
          {s.text}
        </span>
      ))}
    </>
  );
}

const HR_MARGIN: Record<RichAlign, CSSProperties['marginInline']> = {
  left: '0 auto',
  center: 'auto',
  right: 'auto 0',
};

/**
 * «Багатий текст» on a slide (1.22.0-beta.1, F1107-14): the own text's blocks — headings, bullets
 * and numbers (drawn as a mark before the words, so they sit well in centred text too), quotes,
 * divider lines, bold and italic — in the slide's look; the text's own alignment over the look's.
 */
export function RichLines({ rich, style }: { rich: RichText; style: SlideStyle }) {
  const align = rich.align ?? style.align;
  const weight = style.bold ? 700 : 500;
  return (
    <div style={{ textAlign: align }}>
      {rich.blocks.map((x, i) => {
        if (x.kind === 'hr')
          return (
            <div
              key={i}
              aria-hidden
              style={{
                width: '40%',
                height: 0,
                borderTop: '0.06em solid currentColor',
                opacity: 0.45,
                marginBlock: '0.3em',
                marginInline: HR_MARGIN[align],
              }}
            />
          );
        const base: CSSProperties = { margin: 0, fontWeight: weight, whiteSpace: 'pre-wrap' };
        if (x.kind === 'h')
          return (
            <p key={i} style={{ ...base, fontSize: '1.2em', fontWeight: 800 }}>
              <Spans spans={x.spans} />
            </p>
          );
        if (x.kind === 'quote')
          return (
            <p key={i} style={{ ...base, fontStyle: 'italic', opacity: 0.85 }}>
              <Spans spans={x.spans} />
            </p>
          );
        if (x.kind === 'li')
          return (
            <p key={i} style={base}>
              <span style={{ opacity: 0.75 }}>
                {x.n != null ? `${x.n}.` : '•'}
                {' '}
              </span>
              <Spans spans={x.spans} />
            </p>
          );
        return (
          <p key={i} style={base}>
            <Spans spans={x.spans} />
          </p>
        );
      })}
    </div>
  );
}
