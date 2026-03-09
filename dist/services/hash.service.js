"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDateMaskedHash = generateDateMaskedHash;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Deterministically generates a SHA-256 hash of the content.
 *
 * This ensures that a section or page is only marked as "MODIFIED"
 * when substantive content changes, while still storing and
 * displaying the original, unmasked content.
 *
 * @param content - Content for hashing (already date-masked during normalization)
 * @returns SHA-256 hash of the content
 */
function generateDateMaskedHash(content) {
    return crypto_1.default.createHash('sha256').update(content).digest('hex');
}
