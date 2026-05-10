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
 * Spec: norms §8 (forthcoming).
 */

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
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

export function HtmlValidationBanner({ issues }: HtmlValidationBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (issues.length === 0) return null;

  const summary = summarize(issues);
  // Top-level styling tracks the most severe level present so the banner's
  // color matches the worst issue inside.
  const topLevel: ValidationLevel =
    summary.error > 0 ? "error" : summary.warning > 0 ? "warning" : "hint";
  const top = LEVEL_STYLE[topLevel];

  return (
    <div
      className={`rounded-lg border ${top.border} ${top.bg} mb-4`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left"
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
