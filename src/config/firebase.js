const { initializeApp, cert } = require("firebase-admin/app");
const env = require("./env");

initializeApp({
    credential: cert(JSON.parse(env.firebaseServiceAccountJson)),
});
