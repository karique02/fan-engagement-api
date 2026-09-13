const pool = require("../../config/database");
const AppError = require("../../shared/errors/AppError");
const repository = require("./membership.repository");
const parametersRepository = require("../parameters/parameters.repository");

function computeDaysRemaining(endsAt) {
    const diffMs = new Date(endsAt).getTime() - Date.now();

    return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

async function getMembershipStatus(userId) {
    const [membership, noticeEnabled, everUsedTrial] = await Promise.all([
        repository.findLatestMembership(pool, userId),
        parametersRepository.getBooleanParameter(
            pool,
            "free_membership_notice_enabled",
            true,
        ),
        repository.hasEverUsedTrial(pool, userId),
    ]);

    const isMember = Boolean(membership) && new Date(membership.endsAt) > new Date();
    const trialAvailable = !everUsedTrial;

    return {
        isMember,
        source: membership ? membership.source : null,
        startedAt: membership ? membership.startedAt : null,
        endsAt: membership ? membership.endsAt : null,
        daysRemaining: isMember ? computeDaysRemaining(membership.endsAt) : 0,
        trialAvailable,
        noticeEnabled,
    };
}

async function activateTrial(userId) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existingTrial = await repository.findTrialMembership(client, userId);

        if (existingTrial) {
            await client.query("ROLLBACK");
            throw new AppError(409, "La prueba gratis ya fue utilizada", {
                reason: "trial_already_used",
            });
        }

        const membership = await repository.insertTrialMembership(client, userId);

        await client.query("COMMIT");

        return membership;
    } catch (error) {
        if (!(error instanceof AppError)) {
            await client.query("ROLLBACK");
        }
        throw error;
    } finally {
        client.release();
    }
}

async function listPromotions(userId) {
    const [promotions, membership] = await Promise.all([
        repository.listActiveMemberPromotions(pool),
        repository.findLatestMembership(pool, userId),
    ]);

    const isMember = Boolean(membership) && new Date(membership.endsAt) > new Date();

    return promotions.map((promotion) => ({
        ...promotion,
        locked: !isMember,
    }));
}

module.exports = { getMembershipStatus, activateTrial, listPromotions };
