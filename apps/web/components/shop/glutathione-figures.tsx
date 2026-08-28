/**
 * The two diagrams and three step icons for the Glutathione page. Inline SVG
 * in the house voice: hairline strokes, mono labels, ink on the paper, no
 * fills. Every figure is aria-hidden; the visible captions beside them carry
 * the meaning.
 */

/** Diagram A: three amino acids assembling into glutathione. */
export function TripeptideFigure() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 190"
      className="w-full max-w-xs text-ink"
      fill="none"
    >
      {/* the three amino acids */}
      {[
        { x: 56, label: 'Cysteine' },
        { x: 160, label: 'Glutamate' },
        { x: 264, label: 'Glycine' },
      ].map(({ x, label }) => (
        <g key={label}>
          <circle cx={x} cy={34} r={5} fill="currentColor" />
          <text
            x={x}
            y={16}
            textAnchor="middle"
            fontSize="11"
            className="font-mono uppercase tracking-wide"
            fill="currentColor"
          >
            {label}
          </text>
          <path d={`M ${x} 44 L 160 108`} stroke="var(--color-stone)" strokeWidth="1" />
        </g>
      ))}
      {/* glutathione */}
      <circle cx={160} cy={138} r={30} stroke="currentColor" strokeWidth="1" />
      <text
        x={160}
        y={143}
        textAnchor="middle"
        fontSize="13"
        className="font-mono uppercase tracking-wide"
        fill="currentColor"
      >
        GSH
      </text>
      <text x={160} y={185} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
        glutathione
      </text>
    </svg>
  );
}

/** Diagram B: the GSH to GSSG redox loop and back. */
export function RedoxFigure() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 190"
      className="w-full max-w-xs text-ink"
      fill="none"
    >
      <defs>
        <marker
          id="redox-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8" stroke="var(--color-stone)" strokeWidth="1" fill="none" />
        </marker>
      </defs>
      {/* GSH, active */}
      <circle cx={70} cy={95} r={32} stroke="currentColor" strokeWidth="1" />
      <text
        x={70}
        y={99}
        textAnchor="middle"
        fontSize="13"
        className="font-mono uppercase tracking-wide"
        fill="currentColor"
      >
        GSH
      </text>
      <text x={70} y={145} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
        active
      </text>
      {/* GSSG, oxidized */}
      <circle cx={250} cy={95} r={32} stroke="currentColor" strokeWidth="1" />
      <text
        x={250}
        y={99}
        textAnchor="middle"
        fontSize="13"
        className="font-mono uppercase tracking-wide"
        fill="currentColor"
      >
        GSSG
      </text>
      <text x={250} y={145} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
        oxidized
      </text>
      {/* forward: neutralizes an oxidant */}
      <path
        d="M 102 78 Q 160 48 218 78"
        stroke="var(--color-stone)"
        strokeWidth="1"
        markerEnd="url(#redox-arrow)"
      />
      <text x={160} y={38} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
        neutralizes an oxidant
      </text>
      {/* back: recycled */}
      <path
        d="M 218 112 Q 160 142 102 112"
        stroke="var(--color-stone)"
        strokeWidth="1"
        markerEnd="url(#redox-arrow)"
      />
      <text x={160} y={166} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
        recycled
      </text>
    </svg>
  );
}

/** The three how-it-works icons: clipboard, stethoscope, package. */
export function StepIcon({ kind }: { kind: 'clipboard' | 'stethoscope' | 'package' }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6 text-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'clipboard' ? (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4a3 3 0 0 1 6 0" />
          <path d="M9 11h6M9 15h4" />
        </>
      ) : kind === 'stethoscope' ? (
        <>
          <path d="M5 3v5a4 4 0 0 0 8 0V3" />
          <path d="M9 12v3a5 5 0 0 0 10 0v-2" />
          <circle cx="19" cy="10" r="2.5" />
        </>
      ) : (
        <>
          <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
          <path d="M4 7l8 4 8-4M12 11v10" />
        </>
      )}
    </svg>
  );
}
