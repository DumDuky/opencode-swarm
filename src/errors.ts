export class SwarmError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>

  constructor(message: string, code = "swarm_error", details?: Record<string, unknown>) {
    super(message)
    this.name = "SwarmError"
    this.code = code
    this.details = details
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof SwarmError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
