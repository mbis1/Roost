"use client";

/**
 * Subtle greyscale isometric-ish house illustration used when a property has
 * no primary photo uploaded. Pure SVG, no external asset.
 */
export function HousePlaceholder({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 150"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6d6d6" />
          <stop offset="1" stopColor="#bcbcbc" />
        </linearGradient>
        <linearGradient id="wall" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ebebeb" />
          <stop offset="1" stopColor="#dedede" />
        </linearGradient>
        <linearGradient id="side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9c9c9" />
          <stop offset="1" stopColor="#b8b8b8" />
        </linearGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="100" cy="132" rx="80" ry="6" fill="#00000010" />

      {/* Right side wall (isometric) */}
      <polygon
        points="100,70 160,95 160,130 100,105"
        fill="url(#side)"
      />

      {/* Front wall */}
      <polygon
        points="40,95 100,70 100,105 40,130"
        fill="url(#wall)"
      />

      {/* Roof */}
      <polygon
        points="40,95 100,70 160,95 100,45"
        fill="url(#roof)"
      />

      {/* Door */}
      <rect x="60" y="100" width="12" height="22" fill="#aaaaaa" rx="1" />

      {/* Window front */}
      <rect x="80" y="98" width="12" height="10" fill="#ffffff70" stroke="#aaa" strokeWidth="0.6" />
      {/* Window side */}
      <rect x="120" y="100" width="14" height="10" fill="#ffffff50" stroke="#999" strokeWidth="0.6" transform="skewY(-15)" />

      {/* Chimney hint */}
      <rect x="120" y="58" width="8" height="12" fill="#b0b0b0" />
    </svg>
  );
}
