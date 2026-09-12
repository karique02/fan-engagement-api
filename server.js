const app = require("./src/app");
const env = require("./src/config/env");
const { startCollaborativeFilteringTrainingScheduler } = require("./src/jobs/collaborativeFiltering.job");
const { startPersonalizedNotificationScheduler } = require("./src/jobs/personalizedNotifications.job");

app.listen(env.port, env.host, () => {
    console.log(`Server running on port ${env.port}`);

    startCollaborativeFilteringTrainingScheduler();
    startPersonalizedNotificationScheduler();
});
