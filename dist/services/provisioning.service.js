"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionApiKey = provisionApiKey;
exports.regenerateApiKey = regenerateApiKey;
const crypto_1 = __importDefault(require("crypto"));
const apiKey_repository_1 = require("../repositories/apiKey.repository");
const tierConfig_1 = require("../config/tierConfig");
const errors_1 = require("../errors");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function provisionApiKey(input) {
    if (!input.email || !EMAIL_REGEX.test(input.email)) {
        throw new errors_1.InvalidEmailError();
    }
    const existingKey = await (0, apiKey_repository_1.findActiveByEmail)(input.email);
    if (existingKey) {
        throw new errors_1.ApiKeyAlreadyExistsError();
    }
    const rawBytes = crypto_1.default.randomBytes(32).toString('hex');
    const prefix = input.environment === 'dev' ? 'pd_dev_' : 'pd_live_';
    const rawKey = `${prefix}${rawBytes}`;
    const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
    const tierConfig = (0, tierConfig_1.getTierConfig)(input.tier);
    const now = new Date();
    const quotaResetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const dbInput = {
        ...input,
        monthlyQuota: tierConfig.monthlyQuota,
    };
    await (0, apiKey_repository_1.insertProvisionedKey)(keyHash, dbInput, quotaResetAt);
    return { rawKey };
}
async function regenerateApiKey(email) {
    if (!email || !EMAIL_REGEX.test(email)) {
        throw new errors_1.InvalidEmailError();
    }
    const existingKey = await (0, apiKey_repository_1.findActiveByEmail)(email);
    if (!existingKey) {
        throw new Error('API_KEY_NOT_FOUND');
    }
    const rawBytes = crypto_1.default.randomBytes(32).toString('hex');
    const prefix = existingKey.environment === 'dev' ? 'pd_dev_' : 'pd_live_';
    const rawKey = `${prefix}${rawBytes}`;
    const keyHash = crypto_1.default.createHash('sha256').update(rawKey).digest('hex');
    await (0, apiKey_repository_1.updateApiKeyHash)(existingKey.id, keyHash);
    return { rawKey };
}
