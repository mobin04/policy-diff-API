"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHash = generateHash;
const crypto_1 = __importDefault(require("crypto"));
function generateHash(content) {
    return crypto_1.default.createHash('sha256').update(content).digest('hex');
}
