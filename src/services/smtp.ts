import { connect } from 'cloudflare:sockets';

export interface SmtpConfig {
  user: string;
  pass: string;
  fromName?: string;
}

export interface SendEmailOptions {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export async function sendEmailViaGmailSmtp(
  config: SmtpConfig,
  options: SendEmailOptions
): Promise<{ success: boolean; data?: any; error?: string }> {
  const host = 'smtp.gmail.com';
  const port = 465;
  const username = config.user.trim();
  const password = config.pass.replace(/\s+/g, '').trim();
  const fromAddress = username;
  const fromName = config.fromName || 'InToday Newsletter';

  let socket: any;
  try {
    socket = connect(
      { hostname: host, port },
      { secureTransport: 'on', allowHalfOpen: false }
    );
    const reader = socket.readable.getReader();
    const writer = socket.writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let buffer = '';

    async function readResponse(): Promise<{ code: number; text: string }> {
      while (true) {
        const lines = buffer.split('\r\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
            const code = parseInt(line.substring(0, 3), 10);
            buffer = lines.slice(i + 1).join('\r\n');
            return { code, text: line };
          }
        }

        const { value, done } = await reader.read();
        if (done) throw new Error('SMTP connection closed unexpectedly');
        buffer += decoder.decode(value, { stream: true });
      }
    }

    async function sendCommand(cmd: string, expectedCode = 250): Promise<string> {
      await writer.write(encoder.encode(cmd + '\r\n'));
      const res = await readResponse();
      if (expectedCode && res.code !== expectedCode && Math.floor(res.code / 100) !== Math.floor(expectedCode / 100)) {
        throw new Error(`SMTP Error [Command: ${cmd.substring(0, 15)}...]: ${res.text}`);
      }
      return res.text;
    }

    // 1. Initial greeting
    await readResponse();

    // 2. EHLO
    await sendCommand('EHLO localhost', 250);

    // 3. AUTH LOGIN
    await sendCommand('AUTH LOGIN', 334);
    await sendCommand(btoa(username), 334);
    await sendCommand(btoa(password), 235);

    // 4. MAIL FROM
    await sendCommand(`MAIL FROM:<${fromAddress}>`, 250);

    // 5. RCPT TO
    for (const recipient of options.to) {
      await sendCommand(`RCPT TO:<${recipient.trim()}>`, 250);
    }

    // 6. DATA
    await sendCommand('DATA', 354);

    // 7. MIME Construction
    const boundary = '----=_NextPart_' + Math.random().toString(36).substring(2);
    const dateStr = new Date().toUTCString();

    let message = '';
    message += `From: ${fromName} <${fromAddress}>\r\n`;
    message += `To: ${options.to.join(', ')}\r\n`;
    message += `Subject: ${options.subject}\r\n`;
    message += `Date: ${dateStr}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    message += `\r\n`;

    // Plain text part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/plain; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: 8bit\r\n`;
    message += `\r\n`;
    message += `${options.text}\r\n`;

    // HTML part
    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset=UTF-8\r\n`;
    message += `Content-Transfer-Encoding: 8bit\r\n`;
    message += `\r\n`;
    message += `${options.html}\r\n`;

    message += `--${boundary}--\r\n`;

    // Dot termination
    const dataResponse = await sendCommand(message + '\r\n.', 250);

    // 8. QUIT
    try {
      await sendCommand('QUIT', 221);
    } catch (_) {}

    try {
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
    } catch (_) {}

    return {
      success: true,
      data: {
        engine: 'Gmail SMTP (smtp.gmail.com:465)',
        from: `${fromName} <${fromAddress}>`,
        recipients: options.to,
        smtpResponse: dataResponse
      }
    };
  } catch (err: any) {
    try {
      if (socket) await socket.close();
    } catch (_) {}
    return {
      success: false,
      error: err?.message || String(err)
    };
  }
}
