import { TEMPLATES, TEMPLATE_FORMATS } from './templates.js'

export const TEMPLATE_TOOL_NAME = 'huozi_template'
export const TEMPLATE_TOOL_USER_FACING_NAME = 'Template'

export function templatePrompt(): string {
  const lines: string[] = [
    'Fetch one of the 5 huozi standard layout ("版") templates as a self-contained HTML scaffold.',
    '',
    'Use this BEFORE generating an HTML file for huozi_share. The returned',
    '`body` is a complete <!doctype html> document with all CSS inlined; fill',
    'in the placeholder content inside <body> and leave the <style> block',
    'untouched. Then huozi_write the result and huozi_share it.',
    '',
    'Formats:',
  ]
  for (const f of TEMPLATE_FORMATS) {
    const meta = TEMPLATES[f]
    lines.push(`  - ${f.padEnd(6)} (${meta.shape}) — ${meta.description}`)
  }
  lines.push(
    '',
    'If the user has not chosen a format, ASK which of the 5 they want — do',
    'not guess silently. Pick by content intent: pitch slides → deck, reel →',
    'story, printable doc → paper, phone article → mobile, desktop landing',
    'or essay → page.',
    '',
    'Workflow:',
    '  1. huozi_template({ format: "deck" })  ← pick from 5',
    '  2. Fill placeholder content inside <body>; leave <style> as-is.',
    '  3. huozi_write({ file_path, content })',
    '  4. huozi_share({ file_path }) → returns the public URL.',
  )
  return lines.join('\n')
}
