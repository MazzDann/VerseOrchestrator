import { useEffect, type MutableRefObject } from 'react';
import { type Slide, type SlideStyle } from '../../presenterBus';

/** The corner QR follows its settings on whatever is on screen now (E20, after the timers' E19). */
export function useQrCornerFollow({
  liveSlideRef,
  slideStyle,
  pushLive,
}: {
  liveSlideRef: MutableRefObject<Slide>;
  slideStyle: SlideStyle;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
}) {
  // The corner QR switched on/off or restyled (0.6.20): show it on what is on screen now,
  // whatever that is (the QR slide itself too).
  useEffect(() => {
    const s = liveSlideRef.current;
    if (!s.visible || s.forceBlack) return;
    const same =
      (s.style?.qrCorner ?? null) === slideStyle.qrCorner &&
      (s.style?.qrStyle ?? null) === (slideStyle.qrStyle ?? null);
    if (same) return;
    pushLive(
      {
        ...s,
        style: {
          ...(s.style ?? slideStyle),
          qrCorner: slideStyle.qrCorner,
          qrStyle: slideStyle.qrStyle,
        },
      },
      { audience: !s.qr },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideStyle.qrCorner, slideStyle.qrStyle]);
}
