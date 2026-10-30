import { Plugin } from "@opencode/plugin"
import { registerCommands, type CommandHost } from "../commands.js"
import { loadConfig } from "../config.js"
import { errorMessage } from "../errors.js"
import { createOpenCodeRuntime, type OpenCodePluginContext } from "../runtime.js"
import { SwarmService } from "../service.js"
import { activeTools, activeToolsDescription, startTool, type ToolDef, type ToolContext } from "../tools.js"
import { extractFiles, extractShellCommand, isEditTool, isReadTool, isShellTool } from "../tool-utils.js"

type Registration = { dispose(): Promise<void> }

export const v2Plugin = Plugin.define({
  id: "opencode-swarm",
  async setup(ctx) {
    const config = loadConfig(ctx.options)
    const runtime = createOpenCodeRuntime(ctx as unknown as OpenCodePluginContext)
    const stateKey = `swarm/state/${encodeURIComponent(ctx.location.directory)}`

    let service: SwarmService
    let startRegistration: Registration | undefined
    let activeRegistration: Registration | undefined
    let activeToolsPromise: Promise<void> | undefined
    let commandsRegistration: Registration | undefined

    const ensureStartTool = async () => {
      if (startRegistration) return
      startRegistration = (await ctx.tool.transform((editor) => {
        editor.namespace({
          name: "swarm",
          description: "Coordinate parallel agent swarms with a shared task board, peer messaging, and file leases.",
        })
        addTool(editor, startTool(service))
      })) as Registration
    }

    const ensureActiveTools = async () => {
      if (activeRegistration) return
      if (activeToolsPromise) return activeToolsPromise
      activeToolsPromise = ctx.tool
        .transform((editor) => {
          editor.namespace({
            name: "swarm",
            description: activeToolsDescription(),
          })
          for (const tool of activeTools(service)) addTool(editor, tool)
        })
        .then((registration) => {
          activeRegistration = registration as Registration
        })
        .catch((error) => {
          activeToolsPromise = undefined
          throw error
        })
      return activeToolsPromise
    }

    service = new SwarmService({
      runtime,
      config,
      onToolsNeeded: ensureActiveTools,
      onStateChanged: async (snapshot) => {
        await ctx.storage.set(stateKey, snapshot as never)
      },
      onNotice: (message) => {
        console.error("[swarm]", message)
      },
    })

    await ensureStartTool()
    commandsRegistration = (await registerCommands(ctx as unknown as CommandHost, service)) as Registration

    const snapshot = await ctx.storage.get(stateKey)
    const hydrated = await service.hydrate(snapshot)
    if (hydrated.loaded > 0) {
      console.error(`[swarm] restored ${hydrated.loaded} swarm(s); ${hydrated.paused} paused. Use /swarm in the root session to resume.`)
    }

    const contextHook = (await ctx.session.hook("context", (event) => {
      const digest = service.digest(event.sessionID)
      if (!digest) return
      const system = event.system as Array<{ type: "text"; text: string }>
      system.push({ type: "text", text: digest })
    })) as Registration

    const permissionHook = (await ctx.permission.hook("evaluate", async (event) => {
      const found = service.memberForSession(event.sessionID)
      if (!found) return

      if (event.action === "subagent") {
        event.effect = "deny"
        event.message =
          "The built-in subagent tool is disabled in swarm sessions. Use swarm_spawn so the orchestrator can track and govern the spawn."
        return
      }

      if (event.action === "edit" || event.action === "write" || event.action === "patch") {
        const paths = event.resources.slice()
        const check = service.checkEdit(event.sessionID, paths)
        if (check.deny) {
          event.effect = "deny"
          event.message = check.message
          return
        }
        const stale = await service.checkStale(event.sessionID, paths)
        if (stale.stale) {
          event.effect = "deny"
          event.message = stale.message
        }
        return
      }

      if (event.action === "shell") {
        const check = service.checkShell(event.sessionID, event.resources.join(" "))
        if (check.effect !== "allow") {
          event.effect = check.effect
          event.message = check.message
        }
      }
    })) as Registration

    const toolBefore = (await ctx.tool.hook("execute.before", async (event) => {
      const files = extractFiles(event.tool, event.input)
      if (isEditTool(event.tool) && files.length > 0) {
        const check = service.checkEdit(event.sessionID, files)
        if (check.deny) throw new Error(`[swarm] ${check.message}`)
        const stale = await service.checkStale(event.sessionID, files)
        if (stale.stale) throw new Error(`[swarm] ${stale.message}`)
      }
      if (isShellTool(event.tool)) {
        const command = extractShellCommand(event.input)
        if (command) {
          const check = service.checkShell(event.sessionID, command)
          if (check.effect === "deny") {
            throw new Error(`[swarm] ${check.message ?? "Shell command blocked."}`)
          }
        }
      }
    })) as Registration

    const toolAfter = (await ctx.tool.hook("execute.after", async (event) => {
      if (event.status !== "completed") return
      const files = extractFiles(event.tool, event.input)
      if (files.length === 0) return
      if (isReadTool(event.tool)) {
        for (const file of files) await service.recordRead(event.sessionID, file)
      } else if (isEditTool(event.tool)) {
        for (const file of files) await service.recordWrite(event.sessionID, file)
      }
    })) as Registration

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          await service.handleEvent(event)
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[swarm] event stream ended:", errorMessage(error))
        }
      }
    })()

    return async () => {
      controller.abort()
      await contextHook.dispose().catch(() => undefined)
      await permissionHook.dispose().catch(() => undefined)
      await toolBefore.dispose().catch(() => undefined)
      await toolAfter.dispose().catch(() => undefined)
      await commandsRegistration?.dispose().catch(() => undefined)
      await activeRegistration?.dispose().catch(() => undefined)
      await startRegistration?.dispose().catch(() => undefined)
      await service.dispose().catch(() => undefined)
    }
  },
})

function addTool(editor: any, tool: ToolDef): void {
  editor.add({
    name: tool.name,
    description: tool.description,
    input: tool.input,
    options: { namespace: "swarm", codemode: false },
    execute: async (input: unknown, context: unknown) => tool.execute(input, context as ToolContext),
  } as never)
}
