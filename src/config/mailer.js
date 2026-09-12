const nodemailer = require("nodemailer");
const env = require("./env");

const mailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: env.smtpUser,
        pass: env.smtpPass,
    },
});

module.exports = mailTransporter;
