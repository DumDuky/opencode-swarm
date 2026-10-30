import { z } from "zod"
import type { ToolContext as V1ToolContext, ToolResult } from "@opencode-ai/plugin"
import { activeTools, startTool, type ToolContext, type ToolDef } from "../tools.js"
import type { SwarmService } from "../service.js"

type LocalTool<T extends z.ZodRawShape> = {
  description: string
  args: T
  execute: (args: z.infer<z.ZodObject<T>>, context: V1ToolContext) => Promise<ToolResult>
}

const tool = <T extends z.ZodRawShape>(input: LocalTool<T>): LocalTool<T> => input

const taskShape = z.object({
  key: z.string().optional(),
  title: z.string(),
  description: z.string(),
  role: z.enum(["worker", "tester", "integrator", "scout", "reviewer", "planner"]),
  files: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
  acceptance: z.string(),
  size: z.enum(["small", "medium", "large"]).optional(),
})

export function createV1Tools(service: SwarmService) {
  const defs = new Map<string, ToolDef>()
  const start = startTool(service)
  defs.set(start.name, start)
  for (const definition of activeTools(service)) defs.set(definition.name, definition)

  const run = async (name: string, args: unknown, context: V1ToolContext): Promise<string> => {
    const definition = defs.get(name)
    if (!definition) return `Swarm error: unknown tool ${name}.`
    const adapted: ToolContext = {
      sessionID: context.sessionID,
      agent: context.agent,
      messageID: context.messageID,
      id: context.messageID,
      signal: context.abort,
      progress: async (update) => {
        context.metadata({ metadata: update })
      },
    }
    const result = await definition.execute(args, adapted)
    return result.content
  }

  return {
    swarm_start: tool({
      description: start.description,
      args: { goal: z.string().describe("The concrete goal for the swarm.") },
      execute: (args, context) => run("start", args, context),
    }),
    swarm_task: tool({
      description: defs.get("task")!.description,
      args: {
        op: z.enum(["create", "list", "claim", "update", "release"]),
        tasks: z.array(taskShape).optional(),
        taskID: z.string().optional(),
        status: z.enum(["todo", "claimed", "working", "blocked", "review", "done", "failed"]).optional(),
        result: z.string().optional(),
        blockers: z.string().optional(),
        files: z.array(z.string()).optional(),
        acceptance: z.string().optional(),
        filter: z
          .object({
            status: z.enum(["todo", "claimed", "working", "blocked", "review", "done", "failed"]).optional(),
            owner: z.string().optional(),
          })
          .optional(),
      },
      execute: (args, context) => run("task", args, context),
    }),
    swarm_spawn: tool({
      description: defs.get("spawn")!.description,
      args: {
        taskID: z.string().optional(),
        role: z.enum(["worker", "tester", "integrator", "scout", "reviewer", "planner"]).optional(),
        model: z.string().optional(),
        agent: z.string().optional(),
        title: z.string().optional(),
        brief: z.string().optional(),
      },
      execute: (args, context) => run("spawn", args, context),
    }),
    swarm_message: tool({
      description: defs.get("message")!.description,
      args: {
        op: z.enum(["send", "read", "wait", "broadcast"]),
        to: z.string().optional(),
        kind: z.enum(["note", "question", "answer", "status", "request", "result"]).optional(),
        priority: z.enum(["low", "normal", "high"]).optional(),
        body: z.string().optional(),
        replyTo: z.string().optional(),
        limit: z.number().optional(),
        timeoutMs: z.number().optional(),
      },
      execute: (args, context) => run("message", args, context),
    }),
    swarm_files: tool({
      description: defs.get("files")!.description,
      args: {
        op: z.enum(["claim", "release", "list"]),
        paths: z.array(z.string()).optional(),
        taskID: z.string().optional(),
        owner: z.string().optional(),
      },
      execute: (args, context) => run("files", args, context),
    }),
    swarm_status: tool({
      description: defs.get("status")!.description,
      args: {},
      execute: (args, context) => run("status", args, context),
    }),
    swarm_wait: tool({
      description: defs.get("wait")!.description,
      args: {
        targets: z.array(z.string()).optional(),
        mode: z.enum(["all", "any"]).optional(),
        timeoutMs: z.number().optional(),
      },
      execute: (args, context) => run("wait", args, context),
    }),
    swarm_finish: tool({
      description: defs.get("finish")!.description,
      args: {
        taskID: z.string().optional(),
        status: z.enum(["done", "failed", "blocked"]).optional(),
        summary: z.string(),
        files: z.array(z.string()).optional(),
        tests: z.string().optional(),
        blockers: z.string().optional(),
      },
      execute: (args, context) => run("finish", args, context),
    }),
    swarm_review: tool({
      description: defs.get("review")!.description,
      args: {
        op: z.enum(["list", "approve", "deny"]),
        requestID: z.string().optional(),
        reason: z.string().optional(),
      },
      execute: (args, context) => run("review", args, context),
    }),
    swarm_stop: tool({
      description: defs.get("stop")!.description,
      args: {
        target: z.string().optional(),
        reason: z.string().optional(),
      },
      execute: (args, context) => run("stop", args, context),
    }),
  }
}
