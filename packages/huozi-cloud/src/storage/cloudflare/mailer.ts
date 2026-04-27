/**
 * Email sender — Resend by default, console.log fallback for local dev.
 *
 * The Worker only sends one kind of email (OTP login codes), so this
 * module's surface is intentionally small. Adding more transactional
 * emails (workspace invites, etc.) later means adding sibling functions
 * here, not generalizing this one.
 */

export interface MailerEnv {
  RESEND_API_KEY?: string
  HUOZI_FROM_EMAIL?: string
  /** Override the product brand on dev / Edge. Defaults to "huozi". */
  HUOZI_BRAND?: string
}

const DEFAULT_FROM = 'huozi <noreply@huozi.app>'

interface SendEmailInput {
  to: string
  subject: string
  text: string
  html: string
}

async function sendEmail(env: MailerEnv, input: SendEmailInput): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // Dev / unconfigured: log to console so the dev can copy-paste the code.
    console.warn(
      `[mailer] RESEND_API_KEY unset; would have emailed ${input.to}\n` +
        `Subject: ${input.subject}\n${input.text}`,
    )
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.HUOZI_FROM_EMAIL ?? DEFAULT_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '?')
    throw new Error(`resend send failed: ${res.status} ${body}`)
  }
}

export async function sendInviteEmail(
  env: MailerEnv,
  input: {
    to: string
    workspaceName: string
    inviterEmail: string
    acceptUrl: string
  },
): Promise<void> {
  const brand = env.HUOZI_BRAND ?? 'huozi'
  const subject = `${input.inviterEmail} invited you to "${input.workspaceName}" on ${brand}`
  const text =
    `${input.inviterEmail} has invited you to join the ${brand} workspace "${input.workspaceName}".\n\n` +
    `Accept the invite: ${input.acceptUrl}\n\n` +
    `This link expires in 7 days. If you didn't expect this invite, you can ignore this email.`
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 24px; color: #333;">
  <h1 style="font-size: 18px; font-weight: 500; margin-bottom: 8px;">You've been invited to ${brand}</h1>
  <p style="font-size: 14px; line-height: 1.5; color: #666;">${input.inviterEmail} added you to the workspace <strong>${input.workspaceName}</strong>.</p>
  <p style="margin: 32px 0;">
    <a href="${input.acceptUrl}" style="display: inline-block; padding: 12px 20px; background: #111; color: #fff; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 500;">Accept invite</a>
  </p>
  <p style="font-size: 13px; color: #888; line-height: 1.5;">Or copy this URL into your browser:<br/><span style="font-family: ui-monospace, Menlo, monospace;">${input.acceptUrl}</span></p>
  <p style="font-size: 13px; color: #888; line-height: 1.5; margin-top: 24px;">This link expires in 7 days. If you didn't expect this invite, you can ignore this email.</p>
</body></html>`
  await sendEmail(env, { to: input.to, subject, text, html })
}

export async function sendOtpEmail(
  env: MailerEnv,
  to: string,
  code: string,
): Promise<void> {
  const brand = env.HUOZI_BRAND ?? 'huozi'
  const subject = `${brand} login code: ${code}`
  const text =
    `Your ${brand} login code is ${code}.\n\n` +
    `It expires in 5 minutes. If you didn't request this, you can ignore this email.`
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 24px; color: #333;">
  <h1 style="font-size: 18px; font-weight: 500; margin-bottom: 24px;">Sign in to ${brand}</h1>
  <p style="font-size: 14px; line-height: 1.5;">Your login code:</p>
  <p style="font-family: ui-monospace, Menlo, monospace; font-size: 32px; letter-spacing: 0.3em; padding: 16px 0; margin: 8px 0 24px; border-top: 1px solid #eee; border-bottom: 1px solid #eee; text-align: center;">${code}</p>
  <p style="font-size: 13px; color: #888; line-height: 1.5;">It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>
</body></html>`
  await sendEmail(env, { to, subject, text, html })
}
