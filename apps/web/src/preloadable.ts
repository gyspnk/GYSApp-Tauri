import {
  createElement,
  lazy,
  useRef,
  type ComponentType,
  type ComponentProps,
} from "react";

/** Warm imports render directly instead of entering React's first Suspense delay. */
export function preloadable<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  let ready: T | undefined;
  let pending: ReturnType<typeof load> | undefined;
  const preload = () =>
    (pending ??= load()
      .then((module) => {
        ready = module.default;
        return module;
      })
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      }));
  const Deferred = lazy(preload);
  const Component = (props: ComponentProps<T>) => {
    // Keep the chosen type for this mount so later theme/locale renders do
    // not remount an initially cold page and discard its reading state.
    const implementation = useRef(ready ?? Deferred).current;
    return createElement(implementation, props);
  };
  return Object.assign(Component, { preload });
}
