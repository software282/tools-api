import { env } from '../config/env.js';

/**
 * Send a transactional email through Resend's HTTP API. Best-effort: a
 * missing RESEND_API_KEY or a failed request never throws — callers treat
 * email as a side effect of some other action, never the action itself, so
 * the caller decides whether/how to log a failure rather than this module
 * raising one.
 *
 * Returns whether the send actually happened.
 */
export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  return res.ok;
}

/** Who to notify when a team requests a part for the shared global library. */
export function partSubmissionNotifyEmails(): string[] {
  return env.PART_SUBMISSION_NOTIFY_EMAILS.split(',').map((e) => e.trim()).filter(Boolean);
}

/**
 * Notify Seattle Solvers staff that a team has requested a part for the
 * shared global library — GET/POST /admin/submissions is where it's reviewed,
 * but that queue has no other way to surface itself (see
 * src/modules/notifications/routes.ts: in-app notifications only reach the
 * *submitting* team, on approval/rejection, not staff on submission).
 */
export async function sendPartSubmissionEmail(opts: {
  teamNumber: number;
  teamName: string;
  partName: string;
}): Promise<boolean> {
  const signInUrl = env.FRONTEND_URL;
  return sendEmail({
    to: partSubmissionNotifyEmails(),
    subject: `Team ${opts.teamNumber} has requested to add a part to the main database`,
    html: `
      <p><strong>Team ${opts.teamNumber} (${escapeHtml(opts.teamName)})</strong> has requested
      to add <strong>${escapeHtml(opts.partName)}</strong> to the shared parts database.</p>
      <p><a href="${signInUrl}">Sign in as a Seattle Solvers admin</a> to review it.</p>
    `.trim(),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
