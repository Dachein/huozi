/**
 * Three numerical stats shown above the connections panel on the
 * workspace home page. Server component — no interactivity, just
 * formats the numbers it's given.
 */

export interface WorkspaceStatsProps {
  files: number;
  recent24h: number;
  agents: number;
  labels: {
    files: string;
    recent: string;
    agents: string;
  };
}

export function WorkspaceStats({
  files,
  recent24h,
  agents,
  labels,
}: WorkspaceStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard value={files} label={labels.files} />
      <StatCard value={recent24h} label={labels.recent} />
      <StatCard value={agents} label={labels.agents} />
    </div>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/15 px-4 py-3 sm:px-5 sm:py-4">
      <div className="font-serif text-2xl sm:text-3xl font-bold leading-none">
        {value.toLocaleString()}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
