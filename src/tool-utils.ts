import { asRecord } from "./util.js"

export function extractFiles(tool: string, input: unknown): string[] {
  const record = asRecord(input)
  const files: string[] = []
  for (const key of ["filePath", "path", "file", "filename", "target"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) files.push(value.trim())
  }
  for (const key of ["files", "paths"]) {
    const value = record[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim()) files.push(item.trim())
      }
    }
  }
  for (const key of ["patchText", "patch"]) {
    const value = record[key]
    if (typeof value === "string") files.push(...parsePatchPaths(value))
  }
  if (tool.toLowerCase().includes("patch") && typeof record.input === "string") {
    files.push(...parsePatchPaths(record.input))
  }
  return [...new Set(files)]
}

export function parsePatchPaths(patch: string): string[] {
  const files: string[] = []
  const patterns = [
    /^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/gm,
    /^\*\*\* Move to:\s*(.+)$/gm,
    /^\+\+\+\s+b\/(.+)$/gm,
    /^---\s+a\/(.+)$/gm,
    /^diff --git a\/(.+?) b\/(.+)$/gm,
  ]
  for (const pattern of patterns) {
    for (const match of patch.matchAll(pattern)) {
      const value = (match[2] ?? match[1])?.trim()
      if (value && !value.startsWith("/dev/null")) files.push(value)
    }
  }
  return files
}

export function extractShellCommand(input: unknown): string {
  const record = asRecord(input)
  for (const key of ["command", "cmd", "script", "shell"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  if (Array.isArray(record.command)) {
    return record.command.filter((item) => typeof item === "string").join(" ")
  }
  return ""
}

export function isReadTool(tool: string): boolean {
  const name = tool.toLowerCase()
  return name === "read" || name.endsWith("_read") || name.endsWith(".read")
}

export function isEditTool(tool: string): boolean {
  const name = tool.toLowerCase()
  return (
    name === "edit" ||
    name === "write" ||
    name === "patch" ||
    name === "apply_patch" ||
    name.endsWith("_edit") ||
    name.endsWith("_write") ||
    name.endsWith("_patch") ||
    name.endsWith(".edit") ||
    name.endsWith(".write")
  )
}

export function isShellTool(tool: string): boolean {
  const name = tool.toLowerCase()
  return name === "bash" || name === "shell" || name.endsWith("_shell") || name.endsWith(".shell")
}
