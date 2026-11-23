import { useEffect, useRef } from 'react';

export function LoginBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    const draw = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = getComputedStyle(element).color;

      for (let row = 0; row < 34; row += 1) {
        const depth = row / 33;
        for (let column = 0; column < 110; column += 1) {
          const across = column / 109;
          const x = (across - .5) * width * (1.08 + .7 * depth) + width / 2;
          const crest = Math.sin(across * 11 + depth * 3.4);
          const y = height * (.53 + depth ** 1.45 * .56 + crest * (.08 + .09 * depth) - across * .22);
          const edge = Math.min(1, Math.abs(across - .5) * 2.5);
          context.globalAlpha = edge * (.14 + .36 * depth) * Math.sin(Math.PI * depth * .92);
          context.beginPath();
          context.arc(x, y, .55 + depth * .9, 0, Math.PI * 2);
          context.fill();
        }
      }
    };

    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <canvas ref={canvas} className="login-backdrop" aria-hidden="true" />;
}
