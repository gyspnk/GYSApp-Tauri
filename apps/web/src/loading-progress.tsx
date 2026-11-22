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
          <span className="loading-dove-img">
            <img
              src={`${import.meta.env.BASE_URL}assets/gys-logo.png`}
              alt=""
              width={377}
              height={48}
            />
          </span>
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
