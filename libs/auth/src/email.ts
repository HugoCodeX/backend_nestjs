import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly client: Resend,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend failed: ${error.message}`);
    }
  }
}

class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `\n[email] To: ${message.to}\n[email] Subject: ${message.subject}\n[email] Body:\n${message.text ?? message.html}\n`,
    );
  }
}

let cached: EmailSender | undefined;

export function getEmailSender(): EmailSender {
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (apiKey && from) {
    cached = new ResendEmailSender(new Resend(apiKey), from);
    return cached;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'RESEND_API_KEY and RESEND_FROM_EMAIL are required in production. Cannot fall back to console sender.',
    );
  }

  cached = new ConsoleEmailSender();
  return cached;
}

export function resetEmailSender(): void {
  cached = undefined;
}
