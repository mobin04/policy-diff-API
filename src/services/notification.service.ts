import { Resend } from 'resend';
import { DB } from '../db';
import { APP_NAME, EMAIL_FROM, RESEND_API_KEY } from '../config';
import { DiffResult } from '../types';

type Logger = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

type EmailClient = {
  emails: {
    send: (payload: { from: string; to: string; subject: string; html: string }) => Promise<{ error?: unknown }>;
  };
};

let resendClient: EmailClient | null = null;

export function setEmailClientForTests(client: EmailClient | null): void {
  resendClient = client;
}

function getResendClient(): EmailClient | null {
  if (!RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function summarizeChanges(result: DiffResult): string {
  if (!result.changes || result.changes.length === 0) {
    return 'A meaningful policy change was detected.';
  }

  return result.changes
    .slice(0, 5)
    .map((change) => {
      if ('section' in change) {
        return `${change.type}: ${change.section}`;
      }
      return `${change.type}: ${change.oldTitle} -> ${change.newTitle}`;
    })
    .join('\n');
}

export async function sendPolicyChangeEmail(
  apiKeyId: number,
  url: string,
  result: DiffResult,
  logger?: Logger,
): Promise<void> {
  const client = getResendClient();
  if (!client) {
    logger?.warn({ apiKeyId, url }, 'Policy change email skipped because RESEND_API_KEY is not configured');
    return;
  }

  const emailResult = await DB.query<{ email: string }>(
    'SELECT email FROM api_keys WHERE id = $1 AND is_active = TRUE',
    [apiKeyId],
  );

  const recipient = emailResult.rows[0]?.email;
  if (!recipient) {
    logger?.warn({ apiKeyId, url }, 'Policy change email skipped because active API key email was not found');
    return;
  }

  const risk = result.risk_level ?? 'LOW';
  const summary = summarizeChanges(result);
  const htmlSummary = escapeHtml(summary).replace(/\n/g, '<br>');

  const { error } = await client.emails.send({
    from: EMAIL_FROM,
    to: recipient,
    subject: `${APP_NAME} detected a policy change`,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #09090b; margin: 0; padding: 32px 20px;">
          <div style="max-width: 560px; margin: 0 auto;">
            <h1 style="font-size: 20px; margin: 0 0 20px;">${escapeHtml(APP_NAME)}</h1>
            <p style="font-size: 14px; line-height: 1.6; color: #3f3f46;">
              A monitored policy page changed during the latest automatic check.
            </p>
            <div style="border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <p style="font-size: 12px; color: #71717a; margin: 0 0 6px;">URL</p>
              <p style="font-size: 14px; margin: 0 0 16px; word-break: break-all;">${escapeHtml(url)}</p>
              <p style="font-size: 12px; color: #71717a; margin: 0 0 6px;">Risk</p>
              <p style="font-size: 14px; font-weight: 700; margin: 0 0 16px;">${escapeHtml(risk)}</p>
              <p style="font-size: 12px; color: #71717a; margin: 0 0 6px;">Summary</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 0;">${htmlSummary}</p>
            </div>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    logger?.error({ apiKeyId, url, error }, 'Policy change email failed');
    return;
  }

  logger?.info({ apiKeyId, url, recipient }, 'Policy change email sent');
}

export async function notifyPolicyChangeIfNeeded(
  apiKeyId: number | null,
  url: string | undefined,
  result: DiffResult,
  logger?: Logger,
): Promise<void> {
  if (!apiKeyId || !url || result.message !== 'Changes detected') {
    return;
  }

  try {
    await sendPolicyChangeEmail(apiKeyId, url, result, logger);
  } catch (error) {
    logger?.error({ apiKeyId, url, error: String(error) }, 'Policy change notification failed');
  }
}
