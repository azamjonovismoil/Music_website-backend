const APP_NAME = 'MusicApp'
const ACCENT = '#0ea5e9'
const ORANGE = '#f97316'

const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#04090f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#04090f;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="background:linear-gradient(180deg,#0f1e38,#0a1525);
                 border:1px solid rgba(56,189,248,0.15);
                 border-radius:20px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-flex;align-items:center;gap:10px;">
                      <div style="width:38px;height:38px;background:linear-gradient(135deg,${ACCENT},#38bdf8);
                                  border-radius:10px;display:inline-block;text-align:center;line-height:38px;">
                        <span style="font-size:20px;">♪</span>
                      </div>
                      <span style="color:#f1f5f9;font-size:18px;font-weight:800;letter-spacing:-0.02em;">
                        ${APP_NAME}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
              <p style="margin:0;color:#334155;font-size:12px;line-height:1.6;">
                This email was sent by ${APP_NAME}. If you didn't request this, ignore it.<br/>
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

const codeBox = (code, color = ACCENT) => `
  <div style="text-align:center;margin:28px 0;">
    <div style="display:inline-block;background:rgba(14,165,233,0.08);
                border:1px solid rgba(14,165,233,0.2);
                border-radius:14px;padding:20px 36px;">
      <span style="font-size:36px;font-weight:900;letter-spacing:10px;color:${color};
              font-family:'Courier New',monospace;">
        ${code}
      </span>
    </div>
    <p style="margin:12px 0 0;color:#475569;font-size:13px;">
      Expires in <strong style="color:#94a3b8;">10 minutes</strong>
    </p>
  </div>
`

// ── Verification email ──────────────────────────────────────
const verificationTemplate = (userName, code) => ({
  subject: `${code} is your ${APP_NAME} verification code`,
  text: `Hi ${userName},\n\nYour verification code is: ${code}\n\nExpires in 10 minutes.`,
  html: baseLayout(`
    <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:22px;font-weight:800;">
      Verify your email
    </h2>
    <p style="margin:0 0 4px;color:#94a3b8;font-size:15px;line-height:1.6;">
      Hi <strong style="color:#e2e8f0;">${userName}</strong>, welcome to ${APP_NAME}!
    </p>
    <p style="margin:0 0 8px;color:#64748b;font-size:14px;line-height:1.6;">
      Use the code below to verify your email address and activate your account.
    </p>
    ${codeBox(code, ACCENT)}
    <div style="background:rgba(14,165,233,0.05);border-radius:12px;padding:16px 18px;margin-top:8px;">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.7;">
        🔒 Never share this code with anyone.<br/>
        ⏱ This code is valid for <strong style="color:#94a3b8;">10 minutes</strong> only.
      </p>
    </div>
  `),
})

// ── Reset password email ────────────────────────────────────
const resetPasswordTemplate = (userName, code) => ({
  subject: `Reset your ${APP_NAME} password`,
  text: `Hi ${userName},\n\nYour password reset code is: ${code}\n\nExpires in 10 minutes.`,
  html: baseLayout(`
    <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:22px;font-weight:800;">
      Reset your password
    </h2>
    <p style="margin:0 0 4px;color:#94a3b8;font-size:15px;line-height:1.6;">
      Hi <strong style="color:#e2e8f0;">${userName}</strong>,
    </p>
    <p style="margin:0 0 8px;color:#64748b;font-size:14px;line-height:1.6;">
      We received a request to reset your password. Use the code below to continue.
    </p>
    ${codeBox(code, ORANGE)}
    <div style="background:rgba(249,115,22,0.05);border-radius:12px;padding:16px 18px;margin-top:8px;">
      <p style="margin:0;color:#475569;font-size:13px;line-height:1.7;">
        🔒 If you didn't request this, you can safely ignore this email.<br/>
        ⏱ This code expires in <strong style="color:#94a3b8;">10 minutes</strong>.
      </p>
    </div>
  `),
})

// ── Welcome email (register dan keyin) ─────────────────────
const welcomeTemplate = (userName) => ({
  subject: `Welcome to ${APP_NAME} 🎵`,
  text: `Hi ${userName},\n\nYour account is verified. Welcome to ${APP_NAME}!`,
  html: baseLayout(`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:52px;margin-bottom:8px;">🎵</div>
      <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:24px;font-weight:800;">
        You're all set, ${userName}!
      </h2>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">
        Your ${APP_NAME} account is verified and ready to use.<br/>
        Start discovering and listening to your favourite music.
      </p>
    </div>
    <div style="background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.12);
                border-radius:14px;padding:20px 24px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:13px;">
        Enjoy your music experience 🎧
      </p>
    </div>
  `),
})

module.exports = { verificationTemplate, resetPasswordTemplate, welcomeTemplate }