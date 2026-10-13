import { prisma } from "@/lib/prisma";
import webpush from "web-push";
import { sendNotificationEmail, getEmailConfig } from "./email";

// Configure web-push with VAPID keys from environment
const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@elganso.com",
    vapidPublic,
    vapidPrivate
  );
}

// ─── EVENT TYPES ────────────────────────────────────────
export const EVENT_TYPES: Record<
  string,
  { label: string; icon: string; defaultLocked: boolean }
> = {
  timeoff_approved: {
    label: "Vacaciones aprobadas",
    icon: "check",
    defaultLocked: true,
  },
  timeoff_rejected: {
    label: "Vacaciones rechazadas",
    icon: "x",
    defaultLocked: true,
  },
  timeoff_requested: {
    label: "Nueva solicitud de vacaciones",
    icon: "calendar",
    defaultLocked: true,
  },
  shift_change: {
    label: "Cambio de turno",
    icon: "refresh",
    defaultLocked: true,
  },
  extra_hours: {
    label: "Horas extra registradas",
    icon: "clock",
    defaultLocked: false,
  },
  holiday_added: {
    label: "Nuevo festivo",
    icon: "calendar",
    defaultLocked: false,
  },
  system_message: {
    label: "Mensaje del sistema",
    icon: "info",
    defaultLocked: true,
  },
  swap_requested: {
    label: "Intercambio propuesto",
    icon: "swap",
    defaultLocked: true,
  },
  swap_accepted: {
    label: "Intercambio aceptado",
    icon: "check",
    defaultLocked: true,
  },
  swap_approved: {
    label: "Intercambio aprobado",
    icon: "check",
    defaultLocked: true,
  },
  swap_rejected: {
    label: "Intercambio rechazado",
    icon: "x",
    defaultLocked: true,
  },
};

// ─── NOTIFY ─────────────────────────────────────────────
export async function notify({
  eventType,
  recipientUserIds,
  title,
  message,
  link,
  type = "info",
}: {
  eventType: string;
  recipientUserIds: number[];
  title: string;
  message: string;
  link?: string;
  type?: string;
}) {
  // Check email_enabled once for all recipients
  let emailEnabled = false;
  try {
    const emailConfig = await getEmailConfig();
    emailEnabled = emailConfig.enabled && !!emailConfig.apiKey;
  } catch {
    // If config fails, just skip email
  }

  // ─── Paso 1 (se espera): dejar la prueba escrita en disco ───
  // La notificacion in-app es el registro que queda para siempre, con su hora y
  // su marca de leida. Se espera a propósito: cuando quien guarda ve "hecho", el
  // registro ya existe. Son milisegundos, es base de datos local.
  const creadas: { userId: number; notificationId: number | null; push: boolean; email: boolean }[] = [];
  for (const userId of recipientUserIds) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
    });
    // Defaults: inApp = true, push = true, email = false (when no preference record exists)
    const inApp = pref ? pref.inApp : true;
    const push = pref ? pref.push : true;
    const emailPref = pref ? pref.email : false;

    let notificationId: number | null = null;
    if (inApp) {
      const n = await prisma.notification.create({
        data: { userId, title, message, type, link: link || null },
      });
      notificationId = n.id;
    }
    creadas.push({ userId, notificationId, push, email: emailPref && emailEnabled });
  }

  // ─── Paso 2 (NO se espera): push y email ───
  // Son llamadas de red a Apple/Google y a SMTP2GO: cientos de milisegundos cada
  // una, y una suscripcion muerta se queda esperando hasta agotar el tiempo. Se
  // lanzan en segundo plano y el resultado se apunta en la propia notificacion,
  // asi que no se pierde la trazabilidad por no esperar.
  void (async () => {
    for (const r of creadas) {
      if (r.push) {
        const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: r.userId } });
        const payload = JSON.stringify({ title, body: message, url: link });
        let enviados = 0;
        const errores: string[] = [];
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            enviados++;
          } catch (err: any) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              // Suscripcion caducada (movil reinstalado, app borrada)
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
              errores.push(`dispositivo dado de baja (${err.statusCode})`);
            } else {
              errores.push(err.message || "error desconocido");
            }
          }
        }
        if (r.notificationId) {
          await prisma.notification.update({
            where: { id: r.notificationId },
            data: {
              pushedAt: new Date(),
              pushDevices: enviados,
              pushError: errores.length ? errores.join("; ").slice(0, 500) : null,
            },
          }).catch(() => {});
        }
      }

      if (r.email) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: r.userId },
            select: { name: true, email: true },
          });
          if (user?.email) {
            await sendNotificationEmail({ name: user.name, email: user.email }, title, message, link);
          }
        } catch (err) {
          console.error(`Error enviando email a usuario ${r.userId}:`, err);
        }
      }
    }
  })().catch((err) => console.error("Error en el envio en segundo plano:", err));
}
