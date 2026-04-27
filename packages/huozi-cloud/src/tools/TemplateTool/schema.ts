import { z } from 'zod'
import { TEMPLATE_FORMATS } from './templates.js'

export const templateInputSchema = z.object({
  format: z
    .enum(TEMPLATE_FORMATS)
    .describe(
      'One of the 5 huozi standard layouts ("版"). Two unpaginated (long scroll): web (desktop-first, the catch-all default), mobile (mobile-first). Three paginated (one-page-at-a-time, with [data-page] markers): deck (16:9 slide), story (9:16 vertical), paper (A4 print).',
    ),
})

export type TemplateInput = z.infer<typeof templateInputSchema>

export const templateOutputSchema = z.object({
  ok: z.literal(true),
  format: z.enum(TEMPLATE_FORMATS),
  shape: z.string(),
  content_type: z.literal('text/html'),
  body: z.string(),
})

export type TemplateOutput = z.infer<typeof templateOutputSchema>
