import type { StatusReport } from "./types.js"
import { formatMoney, formatTokens, statusIcon, truncate } from "./util.js"

export function formatStatus(report: StatusReport): string {
  const lines: string[] = []
  lines.push(`Swarm \`${report.swarmID}\` — ${report.status}`)
  lines.push(`Goal: ${truncate(report.goal, 300)}`)
  lines.push(
    `You: ${report.you.memberID} (${report.you.role}, depth ${report.you.depth})${report.you.taskID ? ` · task ${report.you.taskID}` : ""}`,
  )
  lines.push(
    `Budget: ${formatMoney(report.budget.spentUsd)} / ${formatMoney(report.budget.maxCostUsd)} · ${formatTokens(report.budget.tokens)} tokens`,
  )
  const done = report.tasks.filter((task) => task.status === "done").length
  const failed = report.tasks.filter((task) => task.status === "failed").length
  const working = report.tasks.filter((task) => task.status === "working" || task.status === "claimed").length
  lines.push(`Progress: ${done}/${report.tasks.length} done · ${working} working · ${failed} failed`)
  if (report.budget.paused) lines.push(`Budget paused: ${report.budget.pauseReason ?? "spending limit reached"}`)

  lines.push("")
  lines.push("Members:")
  if (report.members.length === 0) {
    lines.push("- none")
  } else {
    for (const member of report.members) {
      const task = member.taskTitle ? ` · ${truncate(member.taskTitle, 60)}` : ""
      lines.push(
        `- ${statusIcon(member.status)} ${member.id} ${member.role} [${member.status}]${task} · ${formatMoney(member.costUsd)}${member.depth > 0 ? ` · depth ${member.depth}` : ""}`,
      )
    }
  }

  lines.push("")
  lines.push("Tasks:")
  if (report.tasks.length === 0) {
    lines.push("- none")
  } else {
    for (const task of report.tasks) {
      const files = task.files.length > 0 ? ` · ${task.files.slice(0, 4).join(", ")}${task.files.length > 4 ? "…" : ""}` : ""
      lines.push(`- ${task.id} [${task.status}] ${truncate(task.title, 80)}${task.owner ? ` · ${task.owner}` : ""}${files}`)
    }
  }

  if (report.leases.length > 0) {
    lines.push("")
    lines.push("Leases:")
    for (const lease of report.leases.slice(0, 12)) {
      lines.push(`- ${lease.directory ? "dir " : "file"} ${lease.path} -> ${lease.owner}${lease.taskID ? ` (${lease.taskID})` : ""}`)
    }
    if (report.leases.length > 12) lines.push(`- plus ${report.leases.length - 12} more`)
  }

  if (report.approvals.length > 0) {
    lines.push("")
    lines.push("Pending approvals:")
    for (const approval of report.approvals) {
      lines.push(`- ${approval.id} [${approval.risk}] ${approval.kind} from ${approval.requester}: ${truncate(approval.summary, 120)}`)
    }
  }

  if (report.unreadMessages > 0) {
    lines.push("")
    lines.push(`Unread messages: ${report.unreadMessages} — use \`swarm_message\` op=read.`)
  }

  return lines.join("\n")
}

export function formatDigestHeader(report: StatusReport): string {
  return [
    `<swarm_state id="${report.swarmID}" role="${report.you.role}" member="${report.you.memberID}" depth="${report.you.depth}">`,
    `Goal: ${truncate(report.goal, 240)}`,
    `You: ${report.you.memberID} (${report.you.role})${report.you.taskID ? ` on ${report.you.taskID}` : ""}`,
  ].join("\n")
}
