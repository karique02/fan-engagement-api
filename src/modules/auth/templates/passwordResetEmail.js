const mailTransporter = require("../../../config/mailer");
const env = require("../../../config/env");

async function sendPasswordResetEmail({ email, code }) {
    await mailTransporter.sendMail({
        from: env.mailFrom,
        to: email,
        subject: "Código para restablecer tu contraseña - Walter Ormeño FC",
        text: [
            "Recibimos una solicitud para restablecer tu contraseña.",
            "",
            `Tu código de verificación es: ${code}`,
            "",
            "Este código expira en 1 hora y solo puede usarse una vez.",
            "",
            "Si no solicitaste este cambio, puedes ignorar este correo.",
        ].join("\n"),
        html: `
            <main style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 24px;">
                <h1>Restablece tu contraseña</h1>

                <p>
                    Recibimos una solicitud para restablecer tu contraseña.
                </p>

                <p>
                    Tu código de verificación es:
                </p>

                <p style="margin: 32px 0;">
                    <span
                        style="
                            display: inline-block;
                            background: #EC111A;
                            color: #FFFFFF;
                            letter-spacing: 4px;
                            padding: 12px 20px;
                            border-radius: 6px;
                            font-weight: bold;
                            font-size: 24px;
                        "
                    >
                        ${code}
                    </span>
                </p>

                <p>
                    Este código expira en 1 hora y solo puede usarse una vez.
                </p>

                <p>
                    Si no solicitaste este cambio, puedes ignorar este correo.
                </p>
            </main>
        `,
    });
}

module.exports = { sendPasswordResetEmail };
