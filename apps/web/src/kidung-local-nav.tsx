import { useAnimatedIndicator } from "./animated-indicator.js";
import { useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { navigateSmooth } from "./route-transitions.js";
import { preloadRoute } from "./route-preload.js";
import { translate, type Locale } from "./i18n.js";
import { Icon } from "./icons.js";
import { getMidiPlaylist, subscribeMidiPlaylist } from "./midi-playlist.js";

type KidungSection = "songs" | "playlist";

export function KidungLocalNav({
  active,
  locale,
}: {
  active: KidungSection;
  locale: Locale;
}) {
  const navigate = useNavigate();
  const motion = useAnimatedIndicator(active, 'a[aria-current="page"]');
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const links: Array<{
    id: KidungSection;
    label: string;
    to: string;
    icon: "musicNote" | "queueMusic" | "settings";
  }> = [
    {
      id: "songs",
      label: translate(locale, "kidung.songs"),
      to: "/kidung",
      icon: "musicNote",
    },
    {
      id: "playlist",
      label: translate(locale, "kidung.playlist"),
      to: "/kidung?section=playlist",
      icon: "queueMusic",
    },
  ];
  return (
    <nav
      className="kidung-local-nav"
      aria-label={translate(locale, "kidung.navigation")}
    >
      <div className="kidung-local-nav-links" ref={motion.containerRef}>
        <span
          className="kidung-nav-indicator"
          ref={motion.indicatorRef}
          aria-hidden="true"
        />
        {links.map((link) => (
          <Link
            className={active === link.id ? "is-active" : undefined}
            aria-label={link.label}
            title={link.label}
            key={link.id}
            to={link.to}
            onPointerEnter={() => {
              void preloadRoute(link.to).catch(() => undefined);
            }}
            onFocus={() => {
              void preloadRoute(link.to).catch(() => undefined);
            }}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              if (active === link.id) {
                event.preventDefault();
                return;
              }
              event.preventDefault();
              void navigateSmooth(navigate, link.to);
            }}
            aria-current={active === link.id ? "page" : undefined}
          >
            <Icon name={link.icon} size={15} />
            <span>{link.label}</span>
            {link.id === "playlist" && playlist.items.length > 0 && (
              <small>{playlist.items.length}</small>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
