const APP_NAME = 'Exclusive'
const APP_URL = process.env.CLIENT_URL || 'https://exclusivemusics.vercel.app'
const SUPPORT_EMAIL = process.env.MAIL_FROM || 'support@exclusivemusics.com'

const BRAND_PRIMARY = '#5d82ff'
const BRAND_SECONDARY = '#7c5cff'
const BRAND_WARNING = '#f97316'
const BG = '#070b14'
const CARD = '#111827'
const CARD_ALT = '#0f172a'
const TEXT = '#f8fafc'
const TEXT_SOFT = '#cbd5e1'
const TEXT_MUTED = '#94a3b8'
const BORDER = 'rgba(148, 163, 184, 0.18)'

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const appButton = (label, href) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 0;">
    <tr>
      <td align="center" bgcolor="${BRAND_PRIMARY}" style="border-radius:12px;">
        <a href="${href}"
           style="display:inline-block;padding:14px 22px;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;background:linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY});">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`

const codeBox = (code, color = BRAND_PRIMARY) => `
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:26px 0 10px;">
    <tr>
      <td align="center">
        <div style="display:inline-block;padding:18px 26px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid ${BORDER};">
          <span style="display:inline-block;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;line-height:1;font-weight:900;letter-spacing:10px;color:${color};">
            ${escapeHtml(code)}
          </span>
        </div>
      </td>
    </tr>
  </table>
`

const infoCard = (content) => `
  <div style="margin-top:14px;padding:16px 18px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid ${BORDER};">
    ${content}
  </div>
`

const baseLayout = ({ preheader = '', title = APP_NAME, content }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:Inter,'Segoe UI',Arial,sans-serif;color:${TEXT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BG};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 14px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:10px;">
                    <div style="width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_SECONDARY});text-align:center;line-height:38px;color:#fff;font-size:17px;font-weight:900;">
                      ♪
                    </div>
                  </td>
                  <td valign="middle">
                    <div style="font-size:20px;line-height:1.1;font-weight:900;color:${TEXT};letter-spacing:-0.03em;">
                      ${APP_NAME}
                    </div>
                    <div style="font-size:12px;line-height:1.4;color:${TEXT_MUTED};margin-top:2px;">
                      Premium music experience
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:linear-gradient(180deg, ${CARD}, ${CARD_ALT});border:1px solid ${BORDER};border-radius:24px;padding:32px 28px;box-shadow:0 20px 50px rgba(0,0,0,0.32);">
              ${content}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 6px 0;text-align:center;">
              <p style="margin:0;color:${TEXT_MUTED};font-size:12px;line-height:1.7;">
                This email was sent by ${APP_NAME}. If you didn’t request this, you can safely ignore it.
              </p>
              <p style="margin:8px 0 0;color:${TEXT_MUTED};font-size:12px;line-height:1.7;">
                © ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

const verificationTemplate = (userName, code) => {
  const safeName = escapeHtml(userName || 'there')

  return {
    subject: `${code} is your ${APP_NAME} verification code`,
    text: `Hi ${userName || 'there'},\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes.\n\nIf you didn’t create this account, you can ignore this email.`,
    html: baseLayout({
      title: `${APP_NAME} verification`,
      preheader: `Your verification code is ${code}.`,
      content: `
        <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(93,130,255,0.16);border:1px solid rgba(93,130,255,0.24);color:${TEXT};font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
          Verify account
        </div>

        <h1 style="margin:16px 0 10px;font-size:34px;line-height:1.02;letter-spacing:-0.05em;font-weight:900;color:${TEXT};">
          Verify your email
        </h1>

        <p style="margin:0;color:${TEXT_SOFT};font-size:15px;line-height:1.7;">
          Hi <strong style="color:${TEXT};">${safeName}</strong>, use the verification code below to activate your account.
        </p>

        ${codeBox(code, BRAND_PRIMARY)}

        <p style="margin:0;text-align:center;color:${TEXT_MUTED};font-size:13px;line-height:1.6;">
          This code expires in <strong style="color:${TEXT_SOFT};">10 minutes</strong>.
        </p>

        ${appButton('Open Exclusive', APP_URL)}

        ${infoCard(`
          <p style="margin:0;color:${TEXT_SOFT};font-size:13px;line-height:1.7;">
            Never share this code with anyone. If you didn’t create an account, you can ignore this email.
          </p>
        `)}
      `,
    }),
  }
}

const resetPasswordTemplate = (userName, code) => {
  const safeName = escapeHtml(userName || 'there')

  return {
    subject: `Reset your ${APP_NAME} password`,
    text: `Hi ${userName || 'there'},\n\nYour password reset code is: ${code}\n\nIt expires in 10 minutes.\n\nIf you didn’t request this, ignore this email.`,
    html: baseLayout({
      title: `${APP_NAME} password reset`,
      preheader: `Your password reset code is ${code}.`,
      content: `
        <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(249,115,22,0.14);border:1px solid rgba(249,115,22,0.24);color:${TEXT};font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">
          Password reset
        </div>

        <h1 style="margin:16px 0 10px;font-size:34px;line-height:1.02;letter-spacing:-0.05em;font-weight:900;color:${TEXT};">
          Reset your password
        </h1>

        <p style="margin:0;color:${TEXT_SOFT};font-size:15px;line-height:1.7;">
          Hi <strong style="color:${TEXT};">${safeName}</strong>, use the code below to continue resetting your password.
        </p>

        ${codeBox(code, BRAND_WARNING)}

        <p style="margin:0;text-align:center;color:${TEXT_MUTED};font-size:13px;line-height:1.6;">
          This code expires in <strong style="color:${TEXT_SOFT};">10 minutes</strong>.
        </p>

        ${appButton('Go to Exclusive', APP_URL)}

        ${infoCard(`
          <p style="margin:0;color:${TEXT_SOFT};font-size:13px;line-height:1.7;">
            If you didn’t request a password reset, you can safely ignore this email and your password will stay unchanged.
          </p>
        `)}
      `,
    }),
  }
}

const welcomeTemplate = (userName) => {
  const safeName = escapeHtml(userName || 'there')

  return {
    subject: `Welcome to ${APP_NAME} 🎵`,
    text: `Hi ${userName || 'there'},\n\nYour account is verified and ready to use. Welcome to ${APP_NAME}!`,
    html: baseLayout({
      title: `Welcome to ${APP_NAME}`,
      preheader: `Your account is verified and ready to use.`,
      content: `
        <div style="text-align:center;">
          <div style="font-size:46px;line-height:1;margin-bottom:10px;">🎵</div>

          <h1 style="margin:0 0 10px;font-size:34px;line-height:1.02;letter-spacing:-0.05em;font-weight:900;color:${TEXT};">
            You’re all set, ${safeName}
          </h1>

          <p style="margin:0;color:${TEXT_SOFT};font-size:15px;line-height:1.7;">
            Your account is verified and ready. Start discovering tracks, playlists, and your next favorite vibe.
          </p>

          ${appButton('Open Exclusive', APP_URL)}
        </div>

        ${infoCard(`
          <p style="margin:0;color:${TEXT_SOFT};font-size:13px;line-height:1.7;text-align:center;">
            Need help? Reply from your support flow or contact us at ${escapeHtml(SUPPORT_EMAIL)}.
          </p>
        `)}
      `,
    }),
  }
}

module.exports = {
  verificationTemplate,
  resetPasswordTemplate,
  welcomeTemplate,
}