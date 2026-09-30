import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import { Icon } from "./icons.js";
import { getMidiPlaylist, subscribeMidiPlaylist } from "./midi-playlist.js";

type KidungSection = "songs" | "playlist" | "settings";

export function KidungLocalNav({
  active,
  locale,
}: {
  active: KidungSection;
  locale: Locale;
}) {
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
    {
      id: "settings",
      label: translate(locale, "kidung.settings"),
      to: "/kidung?section=settings",
      icon: "settings",
    },
  ];
  return (
    <nav
      className="kidung-local-nav"
      aria-label={translate(locale, "kidung.navigation")}
    >
      <div className="kidung-local-nav-links">
        {links.map((link) => (
          <Link
            className={active === link.id ? "is-active" : undefined}
            key={link.id}
            to={link.to}
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
