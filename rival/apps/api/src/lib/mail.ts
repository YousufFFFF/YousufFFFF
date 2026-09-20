import { config } from '../config.ts';

/**
 * Transactional email.
 *
 * Only two messages are ever sent: verify your address, and reset your
 * password. The console transport prints them so local development needs no
 * mail server; a deployment swaps in SMTP without touching the call sites.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  send(mail: Mail): Promise<void>;
}

/** Captures mail in-process; used by the console transport and by tests. */
export class ConsoleMailTransport implements MailTransport {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    if (!config.isProduction) {
      console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    }
  }
}

let transport: MailTransport = new ConsoleMailTransport();

export function setMailTransport(next: MailTransport): void {
  transport = next;
}

export function getMailTransport(): MailTransport {
  return transport;
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${config.publicAppUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await transport.send({
    to,
    subject: 'Verify your RIVAL account',
    text: `Welcome to RIVAL.\n\nConfirm your email to start competing:\n${link}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${config.publicAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await transport.send({
    to,
    subject: 'Reset your RIVAL password',
    text: `Reset your password here:\n${link}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore it.`,
  });
}
