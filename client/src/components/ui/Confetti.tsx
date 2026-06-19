import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#2f5d9e", "#c0533e", "#4a7c59", "#c98a2d", "#fdf3b9"];
const COUNT = 30;

interface ConfettiProps {
  x: number;
  y: number;
  onDone: () => void;
}

// A one-shot "party pop" burst from a point, portaled to the body so it
// spills over anything. Self-cleans via onDone after the animation ends.
export function Confetti({ x, y, onDone }: ConfettiProps) {
  const [pieces] = useState(() =>
    Array.from({ length: COUNT }, (_, i) => {
      const angle = (Math.PI * 2 * i) / COUNT + Math.random() * 0.4;
      const dist = 55 + Math.random() * 90;
      return {
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist + 45, // gravity bias downward
        r: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 60,
      };
    })
  );

  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, [onDone]);

  return createPortal(
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: x,
              top: y,
              backgroundColor: p.color,
              animationDelay: `${p.delay}ms`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--r": `${p.r}deg`,
            } as CSSProperties
          }
        />
      ))}
    </>,
    document.body
  );
}
