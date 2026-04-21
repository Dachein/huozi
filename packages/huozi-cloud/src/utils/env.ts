/**
 * Fail-fast env-var accessor for smoke tests + bench scripts.
 *
 * We used to embed literal `hz_…` demo tokens here as fallbacks. That leaked
 * real tokens into git. Fail loud instead: set the env var before running,
 * or the script aborts cleanly.
 */
export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || !v.trim()) {
    console.error(`✗ missing env var: ${name}`)
    console.error(`  export ${name}=<your key>  # e.g. hz_...`)
    process.exit(2)
  }
  return v.trim()
}
