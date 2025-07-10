import axios from "axios";

async function sendTelegramMessage(message, botToken, chatId) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "MarkdownV2",
    });
    console.log("Notification sent to Telegram");
  } catch (err) {
    console.error(
      "Telegram error:",
      err.response?.data ?? err.message,
      "\n—offset →",
      err.response?.data?.parameters?.offset ?? "n/a"
    );
  }
}

export default sendTelegramMessage;
