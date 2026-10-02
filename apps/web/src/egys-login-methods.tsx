import { translate, type Locale } from "./i18n.js";

/** The live v1 portal owns Apple/WhatsApp auth; native sessions use its existing bridge. */
export function EgysLoginMethods({
  locale,
  theme,
  onNativeLogin,
  onGoogleLogin,
}: {
  locale: Locale;
  theme: string;
  onNativeLogin?: (() => void) | undefined;
  onGoogleLogin?: () => void;
}) {
  return (
    <div
      className={`egys-provider-methods${onGoogleLogin ? " egys-provider-all" : ""}`}
    >
      {onGoogleLogin && (
        <button
          type="button"
          className="egys-provider egys-provider-google"
          aria-label={translate(locale, "more.googleLogin")}
          onClick={onGoogleLogin}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.5Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 5-.9 6.6-2.3l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4H3.1v2.6A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.4 14.2a6 6 0 0 1 0-4.4V7.2H3.1a10 10 0 0 0 0 9.6l3.3-2.6Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.2l3.3 2.6c.8-2.3 3-4 5.6-4Z"
            />
          </svg>
          <span>Google</span>
        </button>
      )}
      {(["whatsapp", "apple"] as const).map((provider) => {
        const content = (
          <>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              {provider === "whatsapp" ? (
                <>
                  <path
                    d="M20 11.5a8 8 0 0 1-12 7L3 20l1.5-5A8 8 0 1 1 20 11.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.5 7.5c-2 3 2 7 5 7l1.5-2-2-1-1 1c-1.5-.5-2.5-1.5-3-3l1-1-1.5-1Z"
                    fill="currentColor"
                  />
                </>
              ) : (
                <path
                  d="M16.4 12.5c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3.1-1.6-1.3-.1-2.5.8-3.2.8s-1.7-.8-2.8-.7c-1.5 0-2.9.9-3.6 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.1 2.6 2 .9 0 1.5-.7 2.8-.7s1.8.7 2.9.7 1.8-1 2.5-2c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.1-.8-2.1-3.7ZM14.3 6.4c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2-.5 2.7-1.3Z"
                  fill="currentColor"
                />
              )}
            </svg>
            <span>{provider === "whatsapp" ? "WhatsApp" : "Apple"}</span>
          </>
        );
        const label = translate(
          locale,
          provider === "whatsapp" ? "more.whatsappLogin" : "more.appleLogin",
        );
        return onNativeLogin ? (
          <button
            key={provider}
            type="button"
            className={`egys-provider egys-provider-${provider}`}
            aria-label={label}
            onClick={onNativeLogin}
          >
            {content}
          </button>
        ) : (
          <a
            key={provider}
            className={`egys-provider egys-provider-${provider}`}
            aria-label={label}
            href={`https://e.gys.or.id/login?theme=${theme}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>
        );
      })}
    </div>
  );
}
