// import Imap from "node-imap";
// import path from "path";
// import { fileURLToPath } from "url";
// import { simpleParser } from "mailparser";
// import { htmlToText } from "html-to-text";
// import dotenv from "dotenv";
// import sendTelegramMessage from "../services/telegramNotify.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dotenv.config({ path: path.join(__dirname, "../.env") });

// const WATCHED = [
//   "no-reply@invoicecloud.net",
//   "order-update@amazon.com",
//   "freetier@costalerts.amazonaws.com",
// ]; // интересующие отправители

// const mdV2 = (s = "") =>
//   s
//     .replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1") // экранируем всё из спецификации
//     .replace(/[<>]/g, ""); // убираем угловые скобки

// const imap = new Imap({
//   user: process.env.GMAIL_USER,
//   password: process.env.GOOGLE_APP_PASSWORD,
//   host: "imap.gmail.com",
//   port: 993,
//   tls: true,
// });

// function openInbox(cb) {
//   imap.openBox("INBOX", false, cb);
// }

// imap.once("ready", () => {
//   openInbox((err, box) => {
//     if (err) throw err;

//     // Ищем непрочитанные письма
//     imap.search(["UNSEEN"], (err, results) => {
//       if (err || !results.length) {
//         console.log("Нет новых писем.");
//         return imap.end();
//       }

//       const f = imap.fetch(results, { bodies: "" });

//       f.on("message", (msg) => {
//         msg.on("body", (stream) => {
//           simpleParser(stream, async (err, parsed) => {
//             if (err) return console.error(err);

//             const email = parsed.from.value[0].address;
//             if (!WATCHED.includes(email)) return;

//             /* ─── формируем уведомление ─────────────────────────── */

//             const from = mdV2(parsed.from.text || email);
//             const subject = mdV2(parsed.subject || "(без темы)");

//             // 1. переводим HTML → plain-text, если text части нет
//             const rawBody = parsed.text
//               ? parsed.text
//               : htmlToText(parsed.html || "", {
//                   wordwrap: false,
//                   selectors: [
//                     { selector: "a", options: { ignoreHref: true } }, // текст ссылок
//                     { selector: "img", format: "skip" }, // пропускаем inline-картинки
//                   ],
//                 });

//             // 2. ищем ссылку InvoiceCloud (или любую нужную) - необязательно
//             const payLink = rawBody.match(
//               /https:\/\/[^\s]*invoicecloud[^\s]*/i
//             )?.[0];

//             // 3. основное тело: убираем лишние пробелы, режем до 350 симв.
//             const body = mdV2(
//               rawBody.replace(/\s+/g, " ").trim().slice(0, 350)
//             );

//             // 4. достаём первую картинку, чтобы Telegram сделал превью (опционально)
//             const imgLink =
//               parsed.html?.match(/<img[^>]+src="([^">]+)"/i)?.[1] ?? null;

//             const note =
//               "📬 *Новое письмо*" +
//               `\n*От:* ${from}` +
//               `\n*Тема:* _${subject}_\n` +
//               `${body}` +
//               (payLink ? `\n\n[Оплатить счёт](${mdV2(payLink)}) 💳` : "") +
//               (imgLink ? `\n[‎](${mdV2(imgLink)})` : ""); // zero-width char + превью

//             if (note.trim() && note !== "null") {
//               await sendTelegramMessage(note); // sendTelegramMessage использует MarkdownV2
//             } else {
//               console.log("⚠️ Письмо без текста — уведомление не отправлено");
//             }
//           });
//         });
//       });

//       f.once("end", () => {
//         console.log("Проверка завершена.");
//         imap.end();
//       });
//     });
//   });
// });

// imap.once("error", (err) => console.error(err));
// imap.connect();
