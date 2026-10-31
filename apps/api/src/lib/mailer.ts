import nodemailer from "nodemailer";

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** SMTP via Nodemailer. In development this points at Mailpit (http://localhost:8025). */
export function createSmtpMailer({ host, port, from }: { host: string; port: number; from: string }): Mailer {
  const transport = nodemailer.createTransport({
    host,
    port,
    // Mailpit and most dev SMTP servers don't use TLS on 1025.
    secure: port === 465,
    ignoreTLS: port === 1025,
  });

  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}
