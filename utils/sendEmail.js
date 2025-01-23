import nodemailer from 'nodemailer';

const sendEmail = async (to, subject, html) => {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false, // Временно
    },
    debug: true, // Включаем отладку
    logger: true, // Включаем логирование
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to, // Получатель
    subject, // Тема
    html, // HTML-содержание 
    }; 

    await transporter.sendMail(mailOptions);
}

export default sendEmail;