import { useEffect, useState } from 'react';
import { type Slide, EMPTY_SLIDE, readSlide, subscribeSlide } from '../presenterBus';
import { SlideCanvas } from '../components/SlideCanvas';

export function Presenter() {
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);

  useEffect(() => {
    setSlide(readSlide());
    return subscribeSlide(setSlide);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <SlideCanvas slide={slide} />
    </div>
  );
}
