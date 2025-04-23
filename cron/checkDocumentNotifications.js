import Document from "../services/schemas/document.js";
import Notification from "../services/schemas/notification.js";

export const checkDocumentNotifications = async () => {
  const startOfDay = (date) => {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
  };
  const today = startOfDay(new Date());
  let createdNotifications = 0;
  let documentsProcessed = 0;

  const documents = await Document.find({
    expiryDate: { $ne: null },
    notificationPreferences: { $exists: true, $not: { $size: 0 } },
  });

  console.log("📄 Найдено документов:", documents.length);

  for (const doc of documents) {
    documentsProcessed += 1;
    const expiry = new Date(doc.expiryDate);
    const displayDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(expiry);

    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    const entityType = doc.constructor.modelName;

    for (const pref of doc.notificationPreferences) {
      const {
        daysBefore,
        repeat = "none",
        cancelAfterDate,
        cancelIfStatusChanged,
        eventType = "expiry",
        priority = "low",
        recipients,
        methods,
        onExactDate,
      } = pref;

      let scheduledFor = null;

      if (cancelAfterDate && new Date(cancelAfterDate) < today) continue;
      if (cancelIfStatusChanged && doc.status !== cancelIfStatusChanged)
        continue;
      if (!Array.isArray(recipients) || recipients.length === 0) continue;
      if (!Array.isArray(methods) || methods.length === 0) continue;

      if (onExactDate) {
        scheduledFor = startOfDay(new Date(onExactDate));
      } else {
        scheduledFor = new Date(
          expiry.getTime() - (daysBefore ?? 0) * 24 * 60 * 60 * 1000
        );
      }

      // 🔄 Поддержка повторов: daily, weekly, monthly
      if (repeat !== "none" && scheduledFor < today && cancelAfterDate) {
        const end = new Date(cancelAfterDate);
        const intervalDays =
          repeat === "daily"
            ? 1
            : repeat === "weekly"
            ? 7
            : repeat === "monthly"
            ? 30
            : 0;

        let next = new Date(scheduledFor.getTime());

        while (next <= end) {
          const nextStr = next.toDateString();
          const todayStr = today.toDateString();

          if (nextStr === todayStr) {
            scheduledFor = startOfDay(next);
            break;
          }

          next.setDate(next.getDate() + intervalDays);
        }
      }

      let notificationCreated = false;

      for (const recipient of recipients) {
        for (const method of methods) {
          const exists = await Notification.findOne({
            "target.entityId": doc._id,
            "target.entityType": entityType,
            "recipient.userId": recipient.userId,
            method,
            eventType,
            scheduledFor,
            "context.eventDate": expiry,
          });

          if (exists) continue;

          console.log("🚀 Создаём новое уведомление...");

          try {
            await Notification.create({
              target: {
                entityType,
                entityId: doc._id,
              },
              recipient,
              method,
              eventType,
              scheduledFor,
              context: {
                message: `📄 <b>${doc.title}</b> (${doc.type})
🔢 Document No.: ${doc.documentNumber || "—"}
📅 Expiry Date: ${displayDate}
${
  daysBefore != null
    ? `⏳ Before the due date: ${daysBefore} day(s)`
    : onExactDate
    ? `⏳ Scheduled for: ${new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(onExactDate))}`
    : ""
}
🔥 Priority: <b>${priority}</b>
${
  doc.fileUrl
    ? `<a href="${doc.fileUrl}">Открыть документ</a>`
    : "Ссылка на файл отсутствует"
}`,
                eventDate: expiry,
                relatedTitle: doc.title,
                reminderOffset: daysBefore ?? null,
                priority,
              },
            });

            notificationCreated = true;
            createdNotifications += 1;
          } catch (error) {
            console.error("❌ Ошибка создания уведомления:", error.message);
          }
        }
      }
      // Обновляем lastTriggeredAt только если уведомление было создано сегодня
      if (
        notificationCreated &&
        repeat !== "none" &&
        scheduledFor <= today &&
        (!pref.lastTriggeredAt ||
          new Date(pref.lastTriggeredAt).toDateString() !==
            today.toDateString())
      ) {
        pref.lastTriggeredAt = today;
        doc.markModified("notificationPreferences");
      }
    }

    await doc.save();
  }

  console.log("🔁 Уведомления по документам обработаны");
  return { created: createdNotifications, documents: documentsProcessed };
};
