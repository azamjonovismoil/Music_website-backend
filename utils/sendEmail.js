const nodemailer = require('nodemailer')

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT || 587),
    secure: String(process.env.MAIL_SECURE) === 'true',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  })
}

const verifyMailConnection = async () => {
  try {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      console.warn('[Mail] MAIL_USER or MAIL_PASS missing')
      return
    }

    const transporter = createTransporter()
    await transporter.verify()
    console.log('[Mail] SMTP connection verified')
  } catch (err) {
    console.warn('[Mail] SMTP connection failed:', err.message)
  }
}

const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    throw new Error('Mail credentials are missing')
  }

  const transporter = createTransporter()

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    text,
    html,
  })

  console.log(`[Mail] Sent to ${to} - MessageId: ${info.messageId}`)
  return info
}

module.exports = {
  sendEmail,
  verifyMailConnection,
}