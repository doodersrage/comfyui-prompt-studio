import nodemailer from "nodemailer";
import { getEmailConfig, isEmailConfigured } from "./config";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) {
    return transporter;
  }

  const config = getEmailConfig();
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  });
  return transporter;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email is not configured." };
  }

  const config = getEmailConfig();
  const to = input.to.trim();
  if (!to) {
    return { ok: false, error: "Recipient address is required." };
  }

  try {
    await getTransporter().sendMail({
      from: config.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text.replace(/\n/g, "<br>"),
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed.";
    console.error("[email]", message);
    return { ok: false, error: message };
  }
}

export { isEmailConfigured };
