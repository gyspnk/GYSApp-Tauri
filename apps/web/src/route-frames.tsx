import { LoadingProgress } from "./loading-progress.js";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import { Icon } from "./icons.js";
import { recordDiagnostic } from "./diagnostics.js";

type NonReaderRouteId =
  "home" | "sauh" | "suara" | "faith" | "literature" | "more";

function getNonReaderRouteId(pathname: string): NonReaderRouteId {
  if (pathname === "/sauh") return "sauh";
  if (pathname.startsWith("/suara")) return "suara";
  if (pathname === "/iman") return "faith";
  if (pathname.startsWith("/literatur")) return "literature";
  if (pathname === "/lainnya") return "more";
  return "home";
}

function getRouteTitleKey(pathname: string): string {
  if (pathname === "/") return "home.title";
  if (pathname === "/sauh") return "home.sauh";
  if (pathname.startsWith("/suara")) return "home.testimony";
  if (pathname === "/bible") return "page.bibleTitle";
  if (pathname.startsWith("/kidung")) return "page.kidungTitle";
  if (pathname === "/iman") return "nav.iman";
  if (pathname.startsWith("/literatur")) return "literature.title";
  if (pathname === "/lainnya") return "page.moreTitle";
  return "shell.routeOpening";
}

export function NonReaderRouteLoading({
  locale,
  pathname,
}: {
  locale: Locale;
  pathname: string;
}) {
  const routeId = getNonReaderRouteId(pathname);
  const title = translate(locale, getRouteTitleKey(pathname));
  const label = translate(locale, "shell.routeLoading", { title });
  return (
    <div
      className="route-loading non-reader-route-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="non-reader-route-loading"
      data-route={routeId}
    >
      <LoadingProgress label={label} />
    </div>
  );
}

function RouteRecovery({
  locale,
  onRetry,
}: {
  locale: Locale;
  onRetry: () => void;
}) {
  return (
    <section
      className="route-recovery"
      role="alert"
      aria-live="assertive"
      data-testid="route-recovery"
    >
      <div className="route-recovery-mark" aria-hidden="true">
        <Icon name="book" size={25} />
      </div>
      <h1>{translate(locale, "shell.routeErrorTitle")}</h1>
      <p>{translate(locale, "shell.routeErrorBody")}</p>
      <button className="primary-button" type="button" onClick={onRetry}>
        {translate(locale, "shell.routeRetry")}
      </button>
    </section>
  );
}

export function NotFoundPage({ locale }: { locale: Locale }) {
  return (
    <section
      className="route-recovery not-found-page"
      role="status"
      aria-live="polite"
      aria-labelledby="not-found-title"
      data-testid="not-found-page"
    >
      <div className="route-recovery-mark" aria-hidden="true">
        <Icon name="book" size={25} />
      </div>
      <h1 id="not-found-title">{translate(locale, "shell.notFoundTitle")}</h1>
      <p>{translate(locale, "shell.notFoundBody")}</p>
      <Link className="primary-button" to="/">
        {translate(locale, "shell.notFoundHome")}
      </Link>
    </section>
  );
}

export class RouteErrorBoundary extends Component<
  { children: ReactNode; locale: Locale },
  { error: Error | null }
> {
  public override state: { error: Error | null } = { error: null };

  public static getDerivedStateFromError(error: Error): {
    error: Error;
  } {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    recordDiagnostic("error", "route-error-boundary", error);
    console.error("GYSApp route error", error, info);
  }

  public override render(): ReactNode {
    if (this.state.error) {
      return (
        <RouteRecovery
          locale={this.props.locale}
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}
