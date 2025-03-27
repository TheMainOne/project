import axios from 'axios';
import dotenv from "dotenv";    

dotenv.config({ path: '/home/ec2-user/project/.env' });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    });
    console.log('Notification sent to Telegram');
  } catch (err) {
    console.error('Error sending message to Telegram:', err.message);
  }
}

export default sendTelegramMessage;
