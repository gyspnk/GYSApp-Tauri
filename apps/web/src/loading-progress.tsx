export function LoadingProgress({
  label,
  percent,
  showLogo = true,
}: {
  label: string;
  percent?: number | undefined;
  showLogo?: boolean;
}) {
  return (
    <div className="loading-progress">
      {showLogo && (
        <div className="loading-dove-stage" aria-hidden="true">
          <svg
            className="loading-dove-svg loading-progress-logo"
            viewBox="0 0 432 265"
            width="88"
            height="54"
            fill="none"
          >
            <path
              className="gys-arc gys-arc-1"
              d="M0 126L10 155L28 189L49 218L74 244L64 238L40 219L28 207L13 187L5 170L1 156Z"
              fill="var(--gys-teal, #007da4)"
            />
            <path
              className="gys-arc gys-arc-2"
              d="M29 92L32 104L43 134L52 152L68 178L98 216L129 247L138 254L115 242L86 222L65 203L50 185L35 158L29 139L27 127L27 104Z"
              fill="var(--gys-teal, #007da4)"
            />
            <path
              className="gys-arc gys-arc-3"
              d="M57 37L66 77L75 104L83 123L102 159L118 183L140 210L164 234L192 256L177 248L159 236L124 208L97 180L78 154L63 124L55 96L54 81L53 80L53 62Z"
              fill="var(--gys-teal, #007da4)"
            />
            <path
              className="gys-wing-far"
              d="M413 0L430 0L412 13L392 33L384 44L377 58L375 67L364 56L352 52L332 53L312 60L336 35L360 18L381 8L393 4Z"
              fill="var(--gys-teal, #007da4)"
            />
            <path
              className="gys-dove-body"
              d="M345 73L358 74L368 77L381 86L389 98L391 105L391 111L395 118L396 123L387 119L375 116L366 117L362 119L357 124L346 140L333 153L315 164L301 169L283 173L237 175L228 180L219 189L215 196L213 196L205 190L229 173L232 170L231 169L196 184L162 164L191 147L231 134L233 131L228 125L229 124L307 77L329 75L330 74L344 74Z"
              fill="var(--gys-navy, #002d73)"
            />
            <path
              className="gys-wing-near"
              d="M171 38L205 39L244 46L265 53L284 62L301 73L305 77L317 76L234 126L230 127L216 109L192 85L178 74L164 65L150 58L136 53L117 49L121 46L131 43L147 40L170 39Z"
              fill="var(--gys-navy, #002d73)"
            />
          </svg>
        </div>
      )}
      <span
        className="loading-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </span>
      <span className="loading-progress-label">{label}</span>
    </div>
  );
}
