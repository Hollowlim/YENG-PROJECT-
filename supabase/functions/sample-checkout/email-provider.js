// Server-only HTTP adapters with injectable fetch for offline verification.
// This module reads no environment variables and never logs provider data.
export class InvoiceEmailError extends Error {
  constructor(message, deliveryUnknown = true, status = null) {
    super(message);
    this.name = "InvoiceEmailError";
    this.deliveryUnknown = deliveryUnknown;
    this.status = status;
  }
}

const email = (value) => typeof value === "string" && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);

export function createInvoiceEmailSender({ provider = "resend", sendgridKey = "", resendKey = "", fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const selected = String(provider).trim().toLowerCase();
  return async function sendInvoiceEmail(message) {
    if (!Array.isArray(message.to) || message.to.length !== 1 || !email(message.to[0])) throw new InvoiceEmailError("A verified invoice recipient is required.", false);
    let url;
    let headers;
    let body;
    if (selected === "sendgrid") {
      if (!sendgridKey.trim()) throw new InvoiceEmailError("The email provider is not configured.", false);
      if (!email(message.from)) throw new InvoiceEmailError("A valid verified sender email is required.", false);
      url = "https://api.sendgrid.com/v3/mail/send";
      headers = { authorization: `Bearer ${sendgridKey.trim()}`, "content-type": "application/json" };
      body = {
        personalizations: [{ to: [{ email: message.to[0] }] }],
        from: { email: message.from, name: "CROWNNETIC Sample" },
        subject: message.subject,
        content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }],
      };
    } else if (selected === "resend") {
      if (!resendKey.trim()) throw new InvoiceEmailError("The email provider is not configured.", false);
      url = "https://api.resend.com/emails";
      headers = { authorization: `Bearer ${resendKey.trim()}`, "content-type": "application/json", "idempotency-key": message.idempotencyKey };
      body = { from: message.from, to: message.to, subject: message.subject, html: message.html, text: message.text };
    } else throw new InvoiceEmailError("The invoice email provider is not configured.", false);

    let response;
    try {
      response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // A connection failure can happen after the provider accepts a message.
      // Never convert it to an ordinary rejection or expose its raw details.
      throw new InvoiceEmailError("Email acceptance could not be confirmed.", true);
    }
    if (selected === "sendgrid" && response.status === 202) {
      const providerId = response.headers.get("x-message-id");
      return { id: providerId && providerId.length <= 200 ? providerId : `sendgrid:${message.invoiceId}` };
    }
    if (selected === "resend" && response.ok) {
      try {
        const result = await response.json();
        if (typeof result?.id === "string" && result.id && result.id.length <= 200) return { id: result.id };
      } catch { /* No response body is returned or logged. */ }
      throw new InvoiceEmailError("Email acceptance could not be confirmed.", true);
    }
    const definiteRejection = response.status >= 400 && response.status < 500 && response.status !== 408;
    throw new InvoiceEmailError(definiteRejection ? "The email provider rejected this request." : "Email acceptance could not be confirmed.", !definiteRejection, response.status);
  };
}
