import { useEffect, useRef } from 'react';
import { createNetwork } from '../lib/network';

export default function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const network = createNetwork(canvas);
    if (!network) return;

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    let frame = 0;

    const size = () => {
      const rect = canvas.getBoundingClientRect();
      network.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2));
      network.draw();
    };

    const loop = () => {
      if (visible && !document.hidden) {
        network.step();
        network.draw();
      }
      frame = requestAnimationFrame(loop);
    };

    size();
    window.addEventListener('resize', size);

    // Stop work while the hero is scrolled out of view.
    let observer: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      observer.observe(canvas);
    }

    // With reduced motion the network is drawn once and left still.
    if (!calm) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', size);
      observer?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
