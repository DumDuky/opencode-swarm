import type { PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { v1Plugin } from "./v1/plugin.js"

/**
 * Dual-mode entrypoint.
 *
 * - OpenCode V1 calls `server(input, options)` and uses the V1 hooks.
 * - OpenCode V2 reads `id` and calls `setup(context)`. The V2 implementation is
 *   loaded lazily so V1 startup does not pay for the V2 plugin runtime.
 */
export default {
  id: "opencode-swarm",
  async setup(ctx: unknown) {
    const { v2Plugin } = await import("./v2/plugin.js")
    return (v2Plugin.setup as (context: unknown) => Promise<unknown>)(ctx)
  },
  async server(input: PluginInput, options?: PluginOptions) {
    return v1Plugin(input, options)
  },
}
