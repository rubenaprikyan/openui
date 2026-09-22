import {
  GitPullRequest,
  GitMerge,
  GitPullRequestClosed,
  GitPullRequestDraft,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { PullRequestInfo } from "../stores/useStore";

export function prVisual(pr: PullRequestInfo) {
  if (pr.state === "MERGED") return { Icon: GitMerge, color: "#A78BFA", label: "Merged" };
  if (pr.state === "CLOSED") return { Icon: GitPullRequestClosed, color: "#EF4444", label: "Closed" };
  if (pr.isDraft) return { Icon: GitPullRequestDraft, color: "#71717A", label: "Draft" };
  return { Icon: GitPullRequest, color: "#22C55E", label: "Open" };
}

export function checksVisual(checks: PullRequestInfo["checks"]) {
  switch (checks) {
    case "SUCCESS":
      return { Icon: CheckCircle2, color: "#22C55E", label: "Checks passed" };
    case "FAILURE":
      return { Icon: XCircle, color: "#F97316", label: "Checks failed" };
    case "PENDING":
      return { Icon: Clock, color: "#FBBF24", label: "Checks running" };
    default:
      return null;
  }
}

// Compact inline list of PR links with state + CI icons
export function PrBadges({ prs, max = 3 }: { prs: PullRequestInfo[]; max?: number }) {
  if (prs.length === 0) return null;
  const shown = prs.slice(0, max);
  return (
    <div className="flex items-center gap-2 min-w-0 flex-wrap">
      {shown.map((pr) => {
        const { Icon, color, label } = prVisual(pr);
        const checks = pr.state === "OPEN" ? checksVisual(pr.checks) : null;
        return (
          <a
            key={pr.number}
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`${label}: ${pr.title}${checks ? ` · ${checks.label}` : ""}`}
            className="flex items-center gap-1 text-[11px] font-mono hover:underline"
            style={{ color }}
          >
            <Icon className="w-3 h-3 flex-shrink-0" />
            #{pr.number}
            {checks && <checks.Icon className="w-3 h-3 flex-shrink-0" style={{ color: checks.color }} />}
          </a>
        );
      })}
      {prs.length > max && <span className="text-[10px] text-zinc-500">+{prs.length - max}</span>}
    </div>
  );
}
