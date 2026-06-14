// Hand-drawn style SVG illustrations. Pure SVG, no libraries.
// Wobbly strokes via slightly irregular paths + round linecaps.

interface IllustrationProps {
  className?: string;
  size?: number;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Rocket({ className = "", size = 48 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <g {...stroke}>
        <path d="M24 4 C 29 9, 31 17, 30 26 L 18 26 C 17 17, 19 9, 24 4 Z" />
        <circle cx="24" cy="16" r="3.4" />
        <path d="M18 26 C 14 28, 12 32, 12 36 L 17 32" />
        <path d="M30 26 C 34 28, 36 32, 36 36 L 31 32" />
        <path d="M21 31 C 21.5 35, 23 38, 24 40 C 25 38, 26.5 35, 27 31" />
      </g>
    </svg>
  );
}

export function Notebook({ className = "", size = 48 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <g {...stroke}>
        <path d="M12 7 C 20 6, 32 6, 37 7 C 38 18, 38 32, 37 41 C 28 42, 18 42, 12 41 Z" />
        <path d="M12 7 L 12 41" />
        <path d="M9 13 L 15 13 M9 21 L 15 21 M9 29 L 15 29 M9 37 L 15 37" />
        <path d="M19 16 L 32 15.6 M19 23 L 33 22.8 M19 30 L 29 29.7" />
      </g>
    </svg>
  );
}

export function Coffee({ className = "", size = 48 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <g {...stroke}>
        <path d="M10 18 C 17 17, 27 17, 33 18 C 34 25, 33 33, 30 38 C 24 39, 18 39, 14 38 C 11 33, 10 25, 10 18 Z" />
        <path d="M33 21 C 38 20, 40 23, 39 27 C 38 30, 35 31, 32 30" />
        <path d="M17 12 C 16 10, 18 9, 17 7 M23 12 C 22 10, 24 9, 23 7 M29 12 C 28 10, 30 9, 29 7" />
      </g>
    </svg>
  );
}

export function Lightbulb({ className = "", size = 48 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <g {...stroke}>
        <path d="M24 6 C 31 6, 36 11, 36 18 C 36 23, 33 26, 30 29 L 30 33 L 18 33 L 18 29 C 15 26, 12 23, 12 18 C 12 11, 17 6, 24 6 Z" />
        <path d="M19 37 L 29 37 M20 41 L 28 41" />
        <path d="M21 29 C 21 25, 20 22, 24 22 C 28 22, 27 25, 27 29" />
      </g>
    </svg>
  );
}

export function Robot({ className = "", size = 48 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <g {...stroke}>
        <rect x="12" y="14" width="24" height="20" rx="4" />
        <path d="M24 14 L 24 8 M24 8 C 26 8, 26 5, 24 5 C 22 5, 22 8, 24 8" />
        <circle cx="19" cy="22" r="2" />
        <circle cx="29" cy="22" r="2" />
        <path d="M19 28 C 21 30, 27 30, 29 28" />
        <path d="M12 20 L 7 22 M36 20 L 41 22" />
        <path d="M18 34 L 18 40 M30 34 L 30 40" />
      </g>
    </svg>
  );
}

export function SketchArrow({ className = "", size = 48 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className}>
      <g {...stroke}>
        <path d="M8 36 C 16 34, 26 26, 38 13" />
        <path d="M30 13 L 38 13 L 37 21" />
      </g>
    </svg>
  );
}

// A hand-drawn pencil that spins — used in the full-page loader
export function SpinningPencil({ className = "", size = 64 }: IllustrationProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className}>
      <g {...stroke} strokeWidth={2.4}>
        {/* pencil body */}
        <path d="M18 46 L 14 50 L 20 52 Z" />
        <path d="M18 46 L 44 20 C 47 17, 50 17, 53 20 C 56 23, 56 26, 53 29 L 27 55 Z" />
        {/* pencil stripe */}
        <path d="M40 24 L 50 34" />
        {/* wood tip */}
        <path d="M18 46 L 22 42 L 20 52" />
        {/* eraser top */}
        <path d="M47 17 C 49 14, 53 14, 55 17" />
        {/* sparkle dots – hand-drawn feel */}
        <circle cx="8" cy="14" r="1.2" fill="currentColor" stroke="none" />
        <circle cx="54" cy="44" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="32" r="0.9" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// Full-page artsy loader
export function PageLoader() {
  return (
    <div className="graph-paper fixed inset-0 z-50 flex flex-col items-center justify-center gap-6">
      {/* wobbly dashed dots as progress indicator */}
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "2.2px dashed currentColor",
              display: "inline-block",
              animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
              color: "var(--color-ink)",
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}

