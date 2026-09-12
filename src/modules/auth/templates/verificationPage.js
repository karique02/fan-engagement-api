function renderEmailVerificationPage({ success, title, message }) {
    const color = success ? "#0F8A45" : "#B42318";

    return `
        <!doctype html>
        <html lang="es">
            <head>
                <meta charset="UTF-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1.0"
                />
                <title>${title}</title>
            </head>

            <body
                style="
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #F6F6F6;
                    font-family: Arial, sans-serif;
                "
            >
                <main
                    style="
                        width: min(90%, 460px);
                        box-sizing: border-box;
                        padding: 32px;
                        border-radius: 12px;
                        background: #FFFFFF;
                        text-align: center;
                        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.12);
                    "
                >
                    <h1
                        style="
                            margin-top: 0;
                            color: ${color};
                        "
                    >
                        ${title}
                    </h1>

                    <p
                        style="
                            margin-bottom: 0;
                            color: #333333;
                            line-height: 1.5;
                        "
                    >
                        ${message}
                    </p>
                </main>
            </body>
        </html>
    `;
}

module.exports = { renderEmailVerificationPage };
