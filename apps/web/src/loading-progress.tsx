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
        <img
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
