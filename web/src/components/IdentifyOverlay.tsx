/**
 * «Which window is this?» — a big label over an output window for a few seconds, when the
 * control window asks (Вікна виводу → the focus icon), like an OS «identify displays».
 * Temporary operator aid: never part of the slide itself.
 */
export function IdentifyOverlay({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      <div
        style={{
          padding: '2vh 5vh',
          borderRadius: '2vh',
          background: 'rgba(0,0,0,0.72)',
          color: '#fff',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: '12vh',
          lineHeight: 1.1,
          boxShadow: '0 0 0 0.6vh rgba(255,255,255,0.85)',
        }}
      >
        {label}
      </div>
    </div>
  );
}
