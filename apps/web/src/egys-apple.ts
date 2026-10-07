type AppleAuthorization = { code: string; id_token: string; state: string };
type AppleSdk = {
  auth: {
    init(options: object): void;
    signIn(): Promise<{ authorization: AppleAuthorization }>;
  };
};
declare global {
  interface Window {
    AppleID?: AppleSdk;
  }
}
let pending: Promise<void> | undefined;
export function loadEgysApple(): Promise<void> {
  if (window.AppleID) return Promise.resolve();
  return (pending ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error("Apple login timed out"));
    }, 10000);
    script.src =
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.onload = () => {
      window.clearTimeout(timer);
      window.AppleID ? resolve() : reject(new Error("Apple SDK unavailable"));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error("Apple login unavailable"));
    };
    document.head.append(script);
  }).catch((error) => {
    pending = undefined;
    throw error;
  }));
}
export async function signInEgysApple() {
  await loadEgysApple();
  const state = crypto.randomUUID();
  window.AppleID!.auth.init({
    clientId: "id.or.gys.e.client",
    redirectURI: "https://e.gys.or.id/login",
    scope: "name email",
    usePopup: true,
    state,
  });
  const { authorization } = await window.AppleID!.auth.signIn();
  if (
    authorization.state !== state ||
    !authorization.code ||
    !authorization.id_token
  )
    throw new Error("Apple authorization invalid");
  return { code: authorization.code, id_token: authorization.id_token };
}
