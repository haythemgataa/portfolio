import React, { useState, useEffect, useRef } from 'react';
import useResizeObserver from "use-resize-observer";
import styles from './Scrollbar.module.css';

type ScrollbarProps = {
  scrollview: React.RefObject<HTMLDivElement | null>,
  innerChild?: React.RefObject<HTMLDivElement | null>,
  inlineStyle?: React.CSSProperties,
}

type Metrics = {
  isScrollable: boolean,
  barWidth: number,
  trackWidth: number,
  barPos: number,
}

const EMPTY_METRICS: Metrics = {
  isScrollable: false,
  barWidth: 0,
  trackWidth: 0,
  barPos: 0,
};

const Scrollbar: React.FC<ScrollbarProps> = ({
  scrollview,
  innerChild,
  inlineStyle,
}) => {
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const trackRef = useRef<HTMLDivElement>(null);

  // Measure the scroll container and the track, and store the result in state. Reading
  // the refs here rather than during render keeps the rendered output a pure function of
  // state — the previous version bumped a counter to force a re-render and then read
  // ref.current inline, which is not safe under concurrent rendering.
  const measure = () => {
    const view = scrollview.current;
    if (!view) { return }

    const maxScroll = view.scrollWidth - view.offsetWidth;
    const next: Metrics = {
      isScrollable: maxScroll > 0,
      barWidth: view.scrollWidth > 0 ? view.offsetWidth / view.scrollWidth : 0,
      trackWidth: trackRef.current ? trackRef.current.offsetWidth : 0,
      barPos: maxScroll > 0 ? view.scrollLeft / maxScroll : 0,
    };

    setMetrics(prev =>
      prev.isScrollable === next.isScrollable &&
      prev.barWidth === next.barWidth &&
      prev.trackWidth === next.trackWidth &&
      prev.barPos === next.barPos
        ? prev
        : next
    );
  };

  useEffect(() => {
    const view = scrollview.current;
    if (!view) { return }

    const frame = requestAnimationFrame(measure);
    view.addEventListener('scroll', measure, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      view.removeEventListener('scroll', measure);
    };
  }, [scrollview, measure]);

  // The track only exists once we know the area is scrollable, so re-measure after it
  // mounts to pick up its width.
  useEffect(() => {
    if (!metrics.isScrollable) { return }
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [metrics.isScrollable, measure]);

  useResizeObserver({ ref: scrollview as React.RefObject<HTMLDivElement>, onResize: measure });
  useResizeObserver({ ref: innerChild as React.RefObject<HTMLDivElement>, onResize: measure });

  if (!metrics.isScrollable) {
    return null
  }

  return (
    <div style={inlineStyle}>
      <div
        ref={trackRef}
        className={styles.track}>
        <div className={styles.bar} style={{
          width: metrics.barWidth * 100 + "%",
          transform: 'translateX(' + ((1 - metrics.barWidth) * metrics.trackWidth) * metrics.barPos + 'px)'
        }}/>
      </div>
    </div>
  )
}

export default Scrollbar;
