export function LoadingProgress({
  label,
  percent,
}: {
  label: string;
  percent?: number | undefined;
}) {
  return (
    <div className="loading-progress">
      <img
        src={`${import.meta.env.BASE_URL}assets/gys-logo.png`}
        alt="Gereja Yesus Sejati"
      />
      <span
        className="loading-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
      >
        <span
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </span>
      {label}
    </div>
  );
}
