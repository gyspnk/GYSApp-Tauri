export type FaithItem = { number: string; text: string };
export type FaithGroup = {
  language: string;
  title: string;
  content: FaithItem[];
};
export type FaithPack = { faith: FaithGroup[] };

let cached: FaithPack | undefined;
let pending: Promise<FaithPack> | undefined;
export const getCachedFaithPack = () => cached;

/** Build-pinned data is parsed once and shared by preloading and every visit. */
export function loadFaithPack(): Promise<FaithPack> {
  return (pending ??= fetch(`${import.meta.env.BASE_URL}offline/faith.json`, {
    cache: "force-cache",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Faith pack unavailable");
      const value: unknown = await response.json();
      const faith =
        value && typeof value === "object" && "faith" in value
          ? value.faith
          : undefined;
      if (
        !Array.isArray(faith) ||
        !faith.length ||
        !faith.every(
          (group: Partial<FaithGroup>) =>
            group &&
            typeof group.language === "string" &&
            typeof group.title === "string" &&
            Array.isArray(group.content) &&
            group.content.every(
              (item: Partial<FaithItem>) =>
                item &&
                typeof item.number === "string" &&
                typeof item.text === "string",
            ),
        )
      )
        throw new Error("Faith pack is invalid");
      return (cached = { faith });
    })
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}
