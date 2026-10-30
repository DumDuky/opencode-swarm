import { asRecord, asStringArray } from "../util.js"
import { extractFiles, extractShellCommand, isEditTool, isReadTool, isShellTool } from "../tool-utils.js"

/**
 * V1 events use `properties` while the core service uses a small normalized
 * `{ type, data }` shape. Keep the translation here so the swarm logic stays
 * independent of the host plugin version.
 */
export function normalizeV1Event(event: unknown): unknown {
  const record = asRecord(event)
  const type = typeof record.type === "string" ? record.type : ""
  const properties = asRecord(record.properties)
  switch (type) {
    case "session.status":
      return {
        type: "session.status",
        data: { sessionID: properties.sessionID, status: properties.status },
      }
    case "session.idle":
      return { type: "session.idle", data: { sessionID: properties.sessionID } }
    case "session.error":
      return {
        type: "session.execution.failed",
        data: { sessionID: properties.sessionID, error: properties.error },
      }
    case "session.deleted": {
      const info = asRecord(properties.info)
      return {
        type: "session.deleted",
        data: { sessionID: info.id ?? properties.sessionID },
      }
    }
    case "message.updated": {
      const info = asRecord(properties.info)
      return {
        type: "message.updated",
        data: { sessionID: info.sessionID, info },
      }
    }
    case "permission.updated":
      return {
        type: "permission.asked",
        data: {
          sessionID: properties.sessionID,
          action: properties.type,
          resources: normalizePattern(properties.pattern),
        },
      }
    default:
      return { type, data: properties }
  }
}

function normalizePattern(value: unknown): string[] {
  if (typeof value === "string") return [value]
  return asStringArray(value)
}

export function toolPaths(tool: string, args: unknown): string[] {
  return extractFiles(tool, args)
}

export function shellCommand(args: unknown): string {
  return extractShellCommand(args)
}

export function readTool(tool: string): boolean {
  return isReadTool(tool)
}

export function editTool(tool: string): boolean {
  return isEditTool(tool)
}

export function shellTool(tool: string): boolean {
  return isShellTool(tool)
}
