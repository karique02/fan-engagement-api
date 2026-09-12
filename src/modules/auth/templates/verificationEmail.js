const mailTransporter = require("../../../config/mailer");
const env = require("../../../config/env");

async function sendEmailVerificationEmail({ email, rawToken }) {
    const verificationUrl =
        `${env.apiPublicUrl}` +
        `/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`;

    await mailTransporter.sendMail({
        from: env.mailFrom,
        to: email,
        subject: "Verifica tu correo - Walter Ormeño FC",
        text: [
            "Gracias por registrarte en el club deportivo Walter Ormeño.",
            "",
            "Para activar tu cuenta, abre este enlace:",
            verificationUrl,
            "",
            "Este enlace expira en 24 horas.",
        ].join("\n"),
        html: `
            <main style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 24px;">
                <h1>Verifica tu correo</h1>

                <p>
                    Gracias por registrarte en el club deportivo Walter Ormeño.
                </p>

                <p>
                    Para activar tu cuenta, haz clic en el siguiente botón:
                </p>

                <p style="margin: 32px 0;">
                    <a
                        href="${verificationUrl}"
                        style="
                            display: inline-block;
                            background: #EC111A;
                            color: #FFFFFF;
                            text-decoration: none;
                            padding: 12px 20px;
                            border-radius: 6px;
                            font-weight: bold;
                        "
                    >
                        Verificar correo
                    </a>
                </p>

                <p>
                    Este enlace expira en 24 horas.
                </p>

                <p>
                    Si no creaste esta cuenta, puedes ignorar este correo.
                </p>
            </main>
        `,
    });
}

module.exports = { sendEmailVerificationEmail };
