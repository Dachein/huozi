"use client";

/**
 * Validation banner shown above the HTML inline preview in workspace
 * view. Surfaces issues from `validateHuoziHtml` so authors / agents see
 * format / structure / bundle problems before they hit publish.
 *
 * Visibility:
 *   workspace inline + workspace fullscreen → shown
 *   /p/<slug> publish                       → NOT shown (readers don't
 *                                               need dev hints)
 *
 * Compact by default (1 line summary), expandable to a full list. No
 * banner if `issues` is empty.
 *
 * "Copy to Your Agent" button copies a structured prompt onto the
 * clipboard so the author can paste straight back into Claude Code /
 * Cursor / Cowork chat and ask their agent to fix the issues — closing
 * the loop between "huozi rendered with a problem" and "agent rewrites
 * the file". The clipboard payload lists every issue with code, line,
 * remedy, and docRef so the agent has everything it needs without
 * the human having to retype any of it.
 */

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";
import {
  type ValidationIssue,
  type ValidationLevel,
  summarize,
} from "@/lib/html/validate";

export interface HtmlValidationBannerProps {
  issues: ValidationIssue[];
  /**
   * Workspace path of the file these issues belong to. Embedded in the
   * Copy-to-Agent payload so the agent doesn't have to guess which file
   * to edit. Optional only so the existing call sites keep compiling —
   * the file-renderer always supplies it.
   */
  filePath?: string;
}

const LEVEL_STYLE: Record<
  ValidationLevel,
  {
    border: string;
    bg: string;
    text: string;
    Icon: typeof ExclamationTriangleIcon;
    label: string;
  }
> = {
  error: {
    border: "border-red-500/40",
    bg: "bg-red-500/5",
    text: "text-red-700 dark:text-red-400",
    Icon: ExclamationTriangleIcon,
    label: "error",
  },
  warning: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    text: "text-amber-700 dark:text-amber-400",
    Icon: InformationCircleIcon,
    label: "warning",
  },
  hint: {
    border: "border-sky-500/30",
    bg: "bg-sky-500/5",
    text: "text-sky-700 dark:text-sky-400",
    Icon: LightBulbIcon,
    label: "hint",
  },
};

/**
 * Build the clipboard prompt for "Copy to Your Agent". Format is plain
 * text Markdown — readable by humans, parseable by agents, paste-safe
 * into every chat surface (Claude Code, Cursor, Cowork, plain editor).
 *
 * Layout decisions:
 *   - Lead with the task ("fix these issues in <path>") so the agent
 *     doesn't need to infer intent from a bare list
 *   - Each issue: severity · code · line · message · remedy · docRef
 *   - Keep both English keywords and Chinese narrative as authored —
 *     Chinese is what the platform speaks, but the structured keys
 *     (`code`, `line`, `remedy`) give the agent grep-friendly anchors
 */
function buildAgentPrompt(
  issues: ValidationIssue[],
  filePath: string | undefined,
): string {
  const lines: string[] = [];
  const target = filePath ? `\`${filePath}\`` : "this HTML file";
  lines.push(
    `Please fix the following huozi HTML validation issues in ${target}.`,
  );
  lines.push("");
  lines.push(
    "For each issue: open the file at the listed line, apply the remedy, " +
      "and re-check via huozi_validate when done.",
  );
  lines.push("");
  issues.forEach((issue, i) => {
    const head = [
      issue.level.toUpperCase(),
      issue.code,
      issue.line !== undefined ? `line ${issue.line}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${i + 1}. [${head}]`);
    lines.push(`   ${issue.message}`);
    if (issue.remedy) lines.push(`   remedy: ${issue.remedy}`);
    if (issue.docRef) lines.push(`   docRef: ${issue.docRef}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

export function HtmlValidationBanner({
  issues,
  filePath,
}: HtmlValidationBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (issues.length === 0) return null;

  const summary = summarize(issues);
  // Top-level styling tracks the most severe level present so the banner's
  // color matches the worst issue inside.
  const topLevel: ValidationLevel =
    summary.error > 0 ? "error" : summary.warning > 0 ? "warning" : "hint";
  const top = LEVEL_STYLE[topLevel];

  async function copyToAgent(e: React.MouseEvent<HTMLButtonElement>) {
    // Stop propagation so the surrounding "expand" toggle doesn't fire
    // when the user clicks the copy button.
    e.stopPropagation();
    const text = buildAgentPrompt(issues, filePath);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Auto-revert after 2s so a second copy doesn't look stale.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (insecure context, permissions). Fall
      // back to a transient prompt-via-window so the user can still
      // grab the text. Better than silent failure.
      window.prompt("复制给 Agent — 手动复制以下内容:", text);
    }
  }

  return (
    <div
      className={`rounded-lg border ${top.border} ${top.bg} mb-4`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 px-4 py-2.5 text-sm text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDownIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
          )}
          <top.Icon className={`w-4 h-4 shrink-0 ${top.text}`} aria-hidden />
          <span className={`font-medium ${top.text}`}>
            HTML 校验：
            {summary.error > 0 ? `${summary.error} error · ` : ""}
            {summary.warning > 0 ? `${summary.warning} warning · ` : ""}
            {summary.hint > 0 ? `${summary.hint} hint` : ""}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {expanded ? "收起" : "展开"}
          </span>
        </button>
        <button
          type="button"
          onClick={copyToAgent}
          aria-label="Copy issues for your Agent"
          title="复制成 prompt 粘贴给 Claude Code / Cursor / Cowork 等 Agent 修复"
          className={`flex items-center gap-1.5 px-3 my-2 mr-2 rounded-md border text-xs
                       transition-colors
                       ${copied
                         ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
                         : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" aria-hidden />
              已复制
            </>
          ) : (
            <>
              <ClipboardDocumentIcon className="w-3.5 h-3.5" aria-hidden />
              Copy to Your Agent
            </>
          )}
        </button>
      </div>
      {expanded && (
        <ul className="border-t border-border/50 divide-y divide-border/50">
          {issues.map((issue, idx) => (
            <IssueRow key={idx} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const style = LEVEL_STYLE[issue.level];
  return (
    <li className="px-4 py-3 text-sm space-y-1">
      <div className="flex items-baseline gap-2">
        <style.Icon
          className={`w-3.5 h-3.5 shrink-0 ${style.text}`}
          aria-hidden
        />
        <span className={`font-mono text-xs uppercase tracking-wide ${style.text}`}>
          {style.label}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {issue.code}
        </span>
        {issue.line !== undefined && (
          <span className="text-xs text-muted-foreground">line {issue.line}</span>
        )}
      </div>
      {/* Plain text rendering — `message` and `remedy` may contain values
          read out of the author's HTML (format value, bundle key, etc.).
          dangerouslySetInnerHTML here would be an XSS vector against the
          author themselves. Quotes in messages are literal `"` characters. */}
      <p className="text-foreground">{issue.message}</p>
      {issue.remedy && (
        <p className="text-xs text-muted-foreground">→ {issue.remedy}</p>
      )}
    </li>
  );
}
