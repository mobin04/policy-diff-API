"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const requestAbuse_service_1 = require("../requestAbuse.service");
const app_1 = __importDefault(require("../../app"));
// We need to test the internal route directly to verify validateInternalToken instrumentation
// Since validateInternalToken is private to the route file, we test via HTTP
jest.mock('../requestAbuse.service');
describe('Internal Endpoint Abuse Instrumentation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('should record INVALID_INTERNAL_TOKEN_ATTEMPT when token mismatch', async () => {
        const response = await app_1.default.inject({
            method: 'GET',
            url: '/v1/internal/metrics',
            headers: {
                'x-internal-token': 'wrong-token',
            },
        });
        expect(response.statusCode).toBe(401);
        expect(requestAbuse_service_1.recordAbuseEvent).toHaveBeenCalledWith('INVALID_INTERNAL_TOKEN_ATTEMPT', null, expect.any(String));
    });
});
