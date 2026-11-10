/** Resolve hook implementation; registered by ts-resolve-hook.mjs. */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      specifier.endsWith(".js") &&
      /^(?:\.{1,2}\/|\/)/.test(specifier)
    ) {
      return nextResolve(specifier.replace(/\.js$/, ".ts"), context);
    }
    throw error;
  }
}
