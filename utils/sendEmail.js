const { Resend } = require('resend')

let resend = null

const getResend = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is missing')
  }

  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY)
  }

  return resend
}

const verifyMailConnection = async () => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[Mail] RESEND_API_KEY missing')
      return false
    }

    getResend()
    console.log('[Mail] Resend configured')
    return true
  } catch (err) {
    console.warn('[Mail] Resend configuration failed:', err.message)
    return false
  }
}

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) throw new Error('Recipient email is required')
  if (!subject) throw new Error('Email subject is required')
  if (!html && !text) throw new Error('Email content is required')

  const client = getResend()

  const response = await client.emails.send({
    from: process.env.MAIL_FROM || 'Exclusive <onboarding@resend.dev>',
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  })

  if (response?.error) {
    throw new Error(response.error.message || 'Failed to send email')
  }

  console.log(
    `[Mail] Sent to ${Array.isArray(to) ? to.join(', ') : to} - Id: ${response?.data?.id || 'n/a'}`
  )

  return response
}

module.exports = {
  sendEmail,
  verifyMailConnection,
}