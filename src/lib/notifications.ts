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

  for (const userId of recipientUserIds) {
    // Check user preference for this event type
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_eventType: { userId, eventType } },
    });

    // Defaults: inApp = true, push = true, email = false (when no preference record exists)
    const inApp = pref ? pref.inApp : true;
    const push = pref ? pref.push : true;
    const emailPref = pref ? pref.email : false;

    // Create in-app notification if enabled
    if (inApp) {
      await prisma.notification.create({
        data: {
          userId,
          title,
          message,
          type,
          link: link || null,
        },
      });
    }

    // Send web push if enabled
    if (push) {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
      });

      const payload = JSON.stringify({ title, body: message, url: link });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
        } catch (err: any) {
          // If subscription is expired or invalid, remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            console.error(
              `Error enviando push a usuario ${userId}:`,
              err.message
            );
          }
        }
      }
    }

    // Send email notification if enabled
    if (emailPref && emailEnabled) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        });

        if (user && user.email) {
          await sendNotificationEmail(
            { name: user.name, email: user.email },
            title,
            message,
            link
          );
        }
      } catch (err) {
        console.error(
          `Error enviando email a usuario ${userId}:`,
          err
        );
      }
    }
  }
}
