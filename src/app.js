const express = require("express");
const cors = require("cors");

require("./config/env");
require("./config/firebase");

const notFoundMiddleware = require("./shared/errors/notFound.middleware");
const errorMiddleware = require("./shared/errors/error.middleware");

const healthRoutes = require("./modules/health/health.routes");
const authRoutes = require("./modules/auth/auth.routes");
const usersRoutes = require("./modules/users/users.routes");
const imagesRoutes = require("./modules/images/images.routes");
const catalogRoutes = require("./modules/catalog/catalog.routes");
const interactionsRoutes = require("./modules/interactions/interactions.routes");
const cartRoutes = require("./modules/cart/cart.routes");
const purchasesRoutes = require("./modules/purchases/purchases.routes");
const notificationsRoutes = require("./modules/notifications/notifications.routes");
const parametersRoutes = require("./modules/parameters/parameters.routes");
const recommendationsRoutes = require("./modules/recommendations/recommendations.routes");
const dashboardRoutes = require("./modules/dashboard/dashboard.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);
app.use(authRoutes);
app.use(usersRoutes);
app.use(imagesRoutes);
app.use(catalogRoutes);
app.use(interactionsRoutes);
app.use(cartRoutes);
app.use(purchasesRoutes);
app.use(notificationsRoutes);
app.use(parametersRoutes);
app.use(recommendationsRoutes);
app.use(dashboardRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
