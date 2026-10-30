import { formatStatus } from "./format.js"
import { errorMessage } from "./errors.js"
import type { SwarmService } from "./service.js"

export interface CommandHost {
  command: {
    transform(callback: (editor: { add(definition: CommandDefinition): void }) => void): Promise<unknown>
  }
  session: {
    prompt(input: { sessionID: string; text: string; delivery?: "steer" | "queue" }): Promise<unknown>
    synthetic(input: { sessionID: string; text: string; description?: string }): Promise<unknown>
  }
}

export interface CommandDefinition {
  name: string
  description?: string
  execute(input: {
    sessionID: string
    prompt: { text: string }
    delivery: "steer" | "queue"
  }): Promise<void>
}

export async function registerCommands(host: CommandHost, service: SwarmService): Promise<unknown> {
  return host.command.transform((editor) => {
    editor.add({
      name: "swarm",
      description: "Start a parallel agent swarm. Usage: /swarm <goal>",
      async execute({ sessionID, prompt, delivery }) {
        const goal = prompt.text.trim()
        try {
          const existing = service.memberForSession(sessionID)
          if (existing) {
            if (existing.swarm.status === "paused") {
              await service.resumeSwarm(sessionID)
              await host.session.synthetic({
                sessionID,
                text: `Swarm ${existing.swarm.id} resumed.`,
                description: "Swarm resumed",
              })
              if (goal) {
                await host.session.prompt({
                  sessionID,
                  text: `The swarm was resumed. New user direction:\n\n${goal}`,
                  delivery,
                })
              }
              return
            }
            if (goal) {
              await host.session.prompt({
                sessionID,
                text:
                  `The swarm is already active. Treat this as a new user instruction and adjust the plan if needed:\n\n${goal}`,
                delivery,
              })
              return
            }
            const report = await service.status(sessionID)
            await host.session.synthetic({
              sessionID,
              text: formatStatus(report),
              description: "Swarm status",
            })
            return
          }
          if (!goal) {
            await host.session.synthetic({
              sessionID,
              text: "Usage: /swarm <goal> — for example: /swarm Add OAuth login with tests",
              description: "Swarm usage",
            })
            return
          }
          const result = await service.startSwarm(sessionID, goal)
          await host.session.prompt({
            sessionID,
            text: orchestratorPrompt(goal, result.swarm.id, service.workspaceRoot),
            delivery,
          })
        } catch (error) {
          await host.session.synthetic({
            sessionID,
            text: `Could not start the swarm: ${errorMessage(error)}`,
            description: "Swarm error",
          })
        }
      },
    })

    editor.add({
      name: "swarm-status",
      description: "Show the current swarm status.",
      async execute({ sessionID }) {
        try {
          const found = service.memberForSession(sessionID)
          if (found) {
            const report = await service.status(sessionID)
            await host.session.synthetic({
              sessionID,
              text: formatStatus(report),
              description: "Swarm status",
            })
            return
          }
          const active = service.store.activeSwarms()
          await host.session.synthetic({
            sessionID,
            text:
              active.length > 0
                ? `Active swarms:\n${active
                    .map(
                      (swarm) =>
                        `- ${swarm.id} [${swarm.status}] ${swarm.goal}\n  root session: ${swarm.rootSessionID}`,
                    )
                    .join("\n")}`
                : "No active swarms. Start one with /swarm <goal>.",
            description: "Swarm status",
          })
        } catch (error) {
          await host.session.synthetic({
            sessionID,
            text: `Could not read swarm status: ${errorMessage(error)}`,
            description: "Swarm error",
          })
        }
      },
    })

    editor.add({
      name: "swarm-stop",
      description: "Stop the swarm in this session.",
      async execute({ sessionID }) {
        try {
          const found = service.memberForSession(sessionID)
          if (!found) {
            await host.session.synthetic({
              sessionID,
              text: "This session is not part of a swarm.",
              description: "Swarm stop",
            })
            return
          }
          const result = await service.stopSwarm(
            found.swarm.rootSessionID,
            undefined,
            "Stopped by the user",
          )
          await host.session.synthetic({
            sessionID,
            text: result.message,
            description: "Swarm stopped",
          })
        } catch (error) {
          await host.session.synthetic({
            sessionID,
            text: `Could not stop the swarm: ${errorMessage(error)}`,
            description: "Swarm error",
          })
        }
      },
    })

    editor.add({
      name: "swarm-approve",
      description: "Approve a pending swarm request. Usage: /swarm-approve <requestID> [reason]",
      async execute({ sessionID, prompt }) {
        const [requestID, ...rest] = prompt.text.trim().split(/\s+/)
        if (!requestID) {
          await host.session.synthetic({
            sessionID,
            text: "Usage: /swarm-approve <requestID> [reason]",
            description: "Swarm approval",
          })
          return
        }
        try {
          const approval = await service.resolveApprovalAnywhere(
            requestID,
            "approved",
            rest.join(" ") || "Approved by the user.",
            "human",
          )
          await host.session.synthetic({
            sessionID,
            text: `Approval ${approval.id} ${approval.status}.`,
            description: "Swarm approval",
          })
        } catch (error) {
          await host.session.synthetic({
            sessionID,
            text: `Could not approve ${requestID}: ${errorMessage(error)}`,
            description: "Swarm error",
          })
        }
      },
    })

    editor.add({
      name: "swarm-deny",
      description: "Deny a pending swarm request. Usage: /swarm-deny <requestID> [reason]",
      async execute({ sessionID, prompt }) {
        const [requestID, ...rest] = prompt.text.trim().split(/\s+/)
        if (!requestID) {
          await host.session.synthetic({
            sessionID,
            text: "Usage: /swarm-deny <requestID> [reason]",
            description: "Swarm approval",
          })
          return
        }
        try {
          const approval = await service.resolveApprovalAnywhere(
            requestID,
            "denied",
            rest.join(" ") || "Denied by the user.",
            "human",
          )
          await host.session.synthetic({
            sessionID,
            text: `Approval ${approval.id} ${approval.status}.`,
            description: "Swarm approval",
          })
        } catch (error) {
          await host.session.synthetic({
            sessionID,
            text: `Could not deny ${requestID}: ${errorMessage(error)}`,
            description: "Swarm error",
          })
        }
      },
    })
  })
}

function orchestratorPrompt(goal: string, swarmID: string, workspaceRoot: string): string {
  return [
    `You are the orchestrator of swarm ${swarmID}.`,
    `Workspace root: ${workspaceRoot}`,
    "",
    `Goal: ${goal}`,
    "",
    "Start by inspecting the repository. Then create a task plan with swarm_task op=create.",
    "Rules for the plan:",
    "- Give every implementer task a file write-set. The board rejects overlapping write-sets unless one task depends on the other.",
    "- Keep tasks small or medium. Split large tasks.",
    "- Use scout/planner tasks for read-only research, and reviewer tasks for verification.",
    "- Then spawn 2-4 workers with swarm_spawn taskID=... and let them work in parallel.",
    "",
    "While the swarm runs:",
    "- Use swarm_status to see progress and swarm_wait to wait for results.",
    "- Answer peer messages. Do not micromanage routine work.",
    "- Use swarm_review only for escalations: sub-subagents, directory leases, member/concurrency thresholds, and budget warnings.",
    "- Default to allowing routine requests unless there is a concrete safety or cost risk.",
    "",
    "When all tasks are done, review the results, run or request final verification, and call swarm_finish with a concise final summary.",
  ].join("\n")
}
