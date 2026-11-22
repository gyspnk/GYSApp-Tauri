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
            className="loading-dove-svg"
            viewBox="0 0 120 96"
            width="64"
            height="52"
            fill="none"
          >
            <g className="dove-wing-left">
              <path
                d="M58 50C44 36 25 22 10 18C18 33 27 45 43 52C48 54 54 54 58 50Z"
                fill="currentColor"
                opacity="0.88"
              />
              <path
                d="M54 52C38 46 22 40 12 36C21 47 32 55 46 57C50 57 53 55 54 52Z"
                fill="currentColor"
                opacity="0.62"
              />
            </g>
            <g className="dove-wing-right">
              <path
                d="M62 50C76 36 95 22 110 18C102 33 93 45 77 52C72 54 66 54 62 50Z"
                fill="currentColor"
                opacity="0.96"
              />
              <path
                d="M66 52C82 46 98 40 108 36C99 47 88 55 74 57C70 57 67 55 66 52Z"
                fill="currentColor"
                opacity="0.68"
              />
            </g>
            <path
              d="M60 36C64 36 67 39 67 44C67 50 64 58 60 66C56 58 53 50 53 44C53 39 56 36 60 36Z"
              fill="currentColor"
            />
            <path
              d="M54 66L60 78L66 66C63 68 57 68 54 66Z"
              fill="currentColor"
              opacity="0.78"
            />
          </svg>
        </div>
      )}
      {showLogo && (
        <img
          className="loading-progress-logo"
          src={`${import.meta.env.BASE_URL}assets/gys-logo.png`}
          alt="Gereja Yesus Sejati"
        />
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
