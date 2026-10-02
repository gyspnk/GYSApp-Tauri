import { useEffect, useState } from "react";
import { readCachedEgysProfile, subscribeEgysProfile } from "./egys.js";
import { Icon } from "./icons.js";

export function AccountAvatar() {
  const [profile, setProfile] = useState(readCachedEgysProfile);
  const [failedUrl, setFailedUrl] = useState<string>();
  useEffect(() => {
    const update = () => setProfile(readCachedEgysProfile());
    const unsubscribe = subscribeEgysProfile(update);
    update();
    return unsubscribe;
  }, []);
  const avatar = profile?.avatarUrl;
  return avatar && avatar !== failedUrl ? (
    <img
      className="account-avatar"
      src={avatar}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(avatar)}
    />
  ) : (
    <Icon name="person" size={18} />
  );
}
