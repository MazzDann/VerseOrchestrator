/**
 * A line of a grown pick on a phone or on «Сцена» (1.13.0-beta.1): the words shown, then the
 * added ones coming in (styles.css `vo-rise-text`); the whole line when it didn't grow.
 */
export function GrownWords({
  text,
  cut,
  ms,
}: {
  text: string;
  cut: number | null | undefined;
  ms: number | null;
}) {
  if (cut == null) return <>{text}</>;
  return (
    <>
      {text.slice(0, cut)}
      <span className="vo-rise-text" style={ms ? { animationDuration: `${ms}ms` } : undefined}>
        {text.slice(cut)}
      </span>
    </>
  );
}
