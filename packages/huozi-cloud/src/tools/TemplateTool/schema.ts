import { z } from 'zod'
import { TEMPLATE_FORMATS } from './templates.js'

export const templateInputSchema = z.object({
  format: z
    .enum(TEMPLATE_FORMATS)
    .describe(
      'One of the 6 huozi standard layouts ("版"): blog (responsive long-flow), deck (16:9 paginated slides), story (9:16 paginated vertical media), paper (A4-width paginated document), dashboard (16:9 tabbed ops surface), app (390×844 mobile UI surface).',
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
