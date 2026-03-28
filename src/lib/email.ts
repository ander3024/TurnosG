import { prisma } from "@/lib/prisma";

// ─── TYPES ──────────────────────────────────────────────

interface EmailConfig {
  enabled: boolean;
  apiKey: string;
  fromAddress: string;
  fromName: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailUser {
  name: string;
  email: string;
}

// ─── CONFIG ─────────────────────────────────────────────

export async function getEmailConfig(): Promise<EmailConfig> {
  const keys = [
    "email_enabled",
    "smtp2go_api_key",
    "email_from_address",
    "email_from_name",
  ];

  const settings = await prisma.setting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(settings.map((s) => [s.key, s.value]));

  return {
    enabled: map.get("email_enabled") === "true",
    apiKey: map.get("smtp2go_api_key") || "",
    fromAddress: map.get("email_from_address") || "turnos@elganso.com",
    fromName: map.get("email_from_name") || "El Ganso Turnos",
  };
}

// ─── SEND EMAIL ─────────────────────────────────────────

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: SendEmailParams): Promise<boolean> {
  const config = await getEmailConfig();

  if (!config.enabled) {
    console.warn("[email] Email sending is disabled in settings.");
    return false;
  }

  if (!config.apiKey) {
    console.warn("[email] No SMTP2GO API key configured.");
    return false;
  }

  try {
    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.apiKey,
        to: [to],
        sender: `${config.fromName} <${config.fromAddress}>`,
        subject,
        html_body: html,
        text_body: text || "",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.data?.error) {
      console.error("[email] SMTP2GO error:", data);
      return false;
    }

    console.log(`[email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send email:", err);
    return false;
  }
}

// ─── BASE TEMPLATE ──────────────────────────────────────

export function baseTemplate(content: string, title: string): string {
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<!--[if mso]>
<style>table,td{font-family:Arial,sans-serif !important;}</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;padding:40px 16px;">
<tr><td align="center">

<!-- Outer container -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(30,58,95,0.10),0 1px 4px rgba(0,0,0,0.06);">

<!-- Header with navy gradient -->
<tr>
<td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 50%,#1e3a5f 100%);padding:36px 40px;text-align:center;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td style="vertical-align:middle;padding-right:16px;">
      <!-- Goose silhouette SVG -->
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 100 100" style="display:block;">
        <circle cx="50" cy="50" r="48" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
        <path d="M58 22c-3-2-7-1-9 2l-6 10c-1 2-1 5 1 7l8 6c1 1 1 2 0 3l-10 4c-5 2-8 7-8 12v8c0 5 3 9 7 11l12 4c3 1 6 1 9 0l12-4c4-2 7-6 7-11v-8c0-5-3-10-8-12l-10-4c-1-1-1-2 0-3l8-6c2-2 2-5 1-7l-6-10c-2-3-5-4-8-2z" fill="rgba(255,255,255,0.85)"/>
        <circle cx="44" cy="36" r="2.5" fill="#1e3a5f"/>
        <path d="M52 32c1-1 3-1 5 0" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" fill="none"/>
      </svg>
    </td>
    <td style="vertical-align:middle;">
      <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:0.5px;text-shadow:0 1px 2px rgba(0,0,0,0.1);">El Ganso</span>
      <br>
      <span style="color:rgba(255,255,255,0.65);font-size:12px;font-weight:500;letter-spacing:2px;text-transform:uppercase;">Gesti&oacute;n de Turnos</span>
    </td>
  </tr>
  </table>
</td>
</tr>

<!-- Body content -->
<tr>
<td style="padding:40px 44px 36px 44px;">
  ${content}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f9fafb;padding:28px 44px;border-top:1px solid #e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center">
    <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;line-height:1.5;font-weight:500;">
      El Ganso &mdash; Gesti&oacute;n de Turnos &copy; ${year}
    </p>
    <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
      Este email fue enviado autom&aacute;ticamente desde el sistema de gesti&oacute;n de turnos.<br>
      Si no deseas recibir estas notificaciones, ajusta tus preferencias en la
      <a href="https://beta.elganso.world/settings" style="color:#2d5a8e;text-decoration:underline;">configuraci&oacute;n de tu cuenta</a>.
    </p>
  </td></tr>
  </table>
</td>
</tr>

</table>
<!-- End outer container -->

</td></tr>
</table>
</body>
</html>`;
}

// ─── BUTTON HELPER ──────────────────────────────────────

function emailButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto 12px auto;">
<tr><td align="center" style="background-color:#1e3a5f;border-radius:10px;box-shadow:0 2px 8px rgba(30,58,95,0.25);">
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:48px;width:220px;v-text-anchor:middle;" arcsize="21%" fillcolor="#1e3a5f">
  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${text}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.3px;line-height:1;">
    ${text}
  </a>
  <!--<![endif]-->
</td></tr>
</table>`;
}

// ─── DIVIDER HELPER ─────────────────────────────────────

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;">`;
}

// ─── WELCOME EMAIL ──────────────────────────────────────

export async function sendWelcomeEmail(user: EmailUser): Promise<boolean> {
  const content = `
    <h1 style="margin:0 0 20px 0;color:#1e3a5f;font-size:24px;font-weight:800;line-height:1.3;">
      &iexcl;Bienvenido/a, ${user.name}!
    </h1>
    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">
      Tu cuenta en <strong style="color:#1e3a5f;">El Ganso Turnos</strong> ha sido creada correctamente.
      Ya puedes acceder al sistema para consultar tus turnos, gestionar vacaciones
      y mucho m&aacute;s.
    </p>
    <p style="margin:0 0 8px 0;color:#374151;font-size:15px;line-height:1.75;">
      Si tienes alguna duda, contacta con tu responsable de tienda o con el equipo de administraci&oacute;n.
    </p>
    ${emailButton("Acceder al sistema", "https://beta.elganso.world/login")}
    ${divider()}
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.6;">
      Si no esperabas este email, puedes ignorarlo de forma segura.
    </p>
  `;

  const html = baseTemplate(content, "Bienvenido/a a El Ganso Turnos");

  return sendEmail({
    to: user.email,
    subject: "Bienvenido/a a El Ganso Turnos",
    html,
    text: `¡Bienvenido/a, ${user.name}! Tu cuenta en El Ganso Turnos ha sido creada. Accede en: https://beta.elganso.world/login`,
  });
}

// ─── PASSWORD RESET EMAIL ───────────────────────────────

export async function sendPasswordResetEmail(
  user: EmailUser,
  resetUrl: string
): Promise<boolean> {
  const content = `
    <h1 style="margin:0 0 20px 0;color:#1e3a5f;font-size:24px;font-weight:800;line-height:1.3;">
      Recupera tu contrase&ntilde;a
    </h1>
    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">
      Hola <strong style="color:#1e3a5f;">${user.name}</strong>, hemos recibido una solicitud para
      restablecer la contrase&ntilde;a de tu cuenta en El Ganso Turnos.
    </p>
    <p style="margin:0 0 8px 0;color:#374151;font-size:15px;line-height:1.75;">
      Haz clic en el bot&oacute;n de abajo para crear una nueva contrase&ntilde;a:
    </p>
    ${emailButton("Restablecer contrase\u00f1a", resetUrl)}
    <div style="margin:28px 0 0 0;padding:18px 22px;background-color:#fef3c7;border-radius:10px;border-left:4px solid #f59e0b;">
      <p style="margin:0 0 6px 0;color:#92400e;font-size:13px;font-weight:700;">
        &#9888;&#65039; Este enlace expira en 1 hora
      </p>
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
        Si no has solicitado restablecer tu contrase&ntilde;a, puedes ignorar este email.
        Tu cuenta seguir&aacute; segura.
      </p>
    </div>
  `;

  const html = baseTemplate(content, "Recupera tu contraseña - El Ganso Turnos");

  return sendEmail({
    to: user.email,
    subject: "Recupera tu contraseña - El Ganso Turnos",
    html,
    text: `Hola ${user.name}, hemos recibido una solicitud para restablecer tu contraseña. Visita: ${resetUrl} — Este enlace expira en 1 hora. Si no lo solicitaste, ignora este email.`,
  });
}

// ─── PASSWORD CHANGED EMAIL ─────────────────────────────

export async function sendPasswordChangedEmail(user: EmailUser): Promise<boolean> {
  const content = `
    <h1 style="margin:0 0 20px 0;color:#1e3a5f;font-size:24px;font-weight:800;line-height:1.3;">
      Contrase&ntilde;a actualizada
    </h1>
    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">
      Hola <strong style="color:#1e3a5f;">${user.name}</strong>, tu contrase&ntilde;a se ha
      actualizado correctamente.
    </p>
    <p style="margin:0 0 8px 0;color:#374151;font-size:15px;line-height:1.75;">
      Ya puedes acceder al sistema con tu nueva contrase&ntilde;a.
    </p>
    ${emailButton("Iniciar sesi\u00f3n", "https://beta.elganso.world/login")}
    <div style="margin:28px 0 0 0;padding:18px 22px;background-color:#fef2f2;border-radius:10px;border-left:4px solid #ef4444;">
      <p style="margin:0 0 6px 0;color:#991b1b;font-size:13px;font-weight:700;">
        &#9888;&#65039; &iquest;No has sido t&uacute;?
      </p>
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.6;">
        Si no has realizado este cambio, contacta inmediatamente con el equipo de
        administraci&oacute;n para proteger tu cuenta.
      </p>
    </div>
  `;

  const html = baseTemplate(content, "Tu contraseña ha sido cambiada");

  return sendEmail({
    to: user.email,
    subject: "Tu contraseña ha sido cambiada",
    html,
    text: `Hola ${user.name}, tu contraseña se ha actualizado correctamente. Si no has sido tú, contacta con administración inmediatamente.`,
  });
}

// ─── NOTIFICATION EMAIL ─────────────────────────────────

export async function sendNotificationEmail(
  user: EmailUser,
  title: string,
  message: string,
  link?: string
): Promise<boolean> {
  const content = `
    <h1 style="margin:0 0 20px 0;color:#1e3a5f;font-size:24px;font-weight:800;line-height:1.3;">
      ${title}
    </h1>
    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">
      Hola <strong style="color:#1e3a5f;">${user.name}</strong>,
    </p>
    <p style="margin:0 0 8px 0;color:#374151;font-size:15px;line-height:1.75;">
      ${message}
    </p>
    ${link ? emailButton("Ver detalle", link) : ""}
  `;

  const html = baseTemplate(content, title);

  return sendEmail({
    to: user.email,
    subject: title,
    html,
    text: `Hola ${user.name}, ${message}${link ? ` — Ver más: ${link}` : ""}`,
  });
}

// ─── TEST EMAIL ─────────────────────────────────────────

export async function sendTestEmail(email: string): Promise<boolean> {
  const now = new Date().toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "full",
    timeStyle: "medium",
  });

  const content = `
    <h1 style="margin:0 0 20px 0;color:#1e3a5f;font-size:24px;font-weight:800;line-height:1.3;">
      Email de prueba
    </h1>
    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">
      &iexcl;Enhorabuena! La configuraci&oacute;n de email est&aacute; funcionando correctamente.
    </p>
    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:1.75;">
      Este mensaje confirma que el sistema de notificaciones por correo electr&oacute;nico
      de <strong style="color:#1e3a5f;">El Ganso Turnos</strong> est&aacute; operativo.
    </p>
    <div style="margin:24px 0 0 0;padding:18px 22px;background-color:#ecfdf5;border-radius:10px;border-left:4px solid #10b981;">
      <p style="margin:0 0 6px 0;color:#065f46;font-size:13px;font-weight:700;">
        &#10003; Conexi&oacute;n con SMTP2GO verificada
      </p>
      <p style="margin:0;color:#065f46;font-size:12px;line-height:1.5;">
        Enviado el ${now}
      </p>
    </div>
  `;

  const html = baseTemplate(content, "Email de prueba - El Ganso Turnos");

  // For test emails, bypass the enabled check and send directly
  const config = await getEmailConfig();

  if (!config.apiKey) {
    throw new Error("SMTP2GO API key not configured. Añade la clave en Ajustes > Email.");
  }

  try {
    const response = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.apiKey,
        to: [email],
        sender: `${config.fromName} <${config.fromAddress}>`,
        subject: "Email de prueba - El Ganso Turnos",
        html_body: html,
        text_body: "¡Enhorabuena! La configuración de email está funcionando correctamente.",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.data?.error) {
      console.error("[email] SMTP2GO test error:", data);
      throw new Error(
        `SMTP2GO error: ${data.data?.error || response.statusText}`
      );
    }

    console.log(`[email] Test email sent to ${email}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send test email:", err);
    throw err;
  }
}
