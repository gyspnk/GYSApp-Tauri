export function LoadingProgress({
  label,
  percent,
}: {
  label: string;
  percent?: number | undefined;
}) {
  return (
    <div className="loading-progress">
      {label}
      <span
        className={`loading-progress-track${percent === undefined ? " is-indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
      >
        <span
          style={percent === undefined ? undefined : { width: `${percent}%` }}
        />
      </span>
    </div>
  );
}
