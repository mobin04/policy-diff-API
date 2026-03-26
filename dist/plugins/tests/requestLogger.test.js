"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const requestLogger_1 = require("../requestLogger");
const requestId_1 = require("../requestId");
const apiLogRepository = __importStar(require("../../repositories/apiLog.repository"));
// Mock the repository to verify calls
jest.mock('../../repositories/apiLog.repository', () => ({
    logApiRequest: jest.fn().mockResolvedValue(undefined),
}));
describe('requestLoggerPlugin', () => {
    let server;
    beforeEach(async () => {
        server = (0, fastify_1.default)();
        // Register requestId as it's a dependency for requestLogger
        await server.register(requestId_1.requestIdPlugin);
        await server.register(requestLogger_1.requestLoggerPlugin);
        server.get('/test', async () => ({ ok: true }));
        server.get('/health', async () => ({ status: 'ok' }));
        server.get('/ready', async () => ({ status: 'ready' }));
        await server.ready();
        jest.clearAllMocks();
    });
    afterEach(async () => {
        await server.close();
    });
    it('should log regular requests to the database', async () => {
        await server.inject({
            method: 'GET',
            url: '/test',
        });
        // Wait for the fire-and-forget logApiRequest to be called
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(apiLogRepository.logApiRequest).toHaveBeenCalledWith(null, '/test', 200, expect.any(Number));
    });
    it('should NOT log /health requests even with query parameters', async () => {
        await server.inject({
            method: 'GET',
            url: '/health?t=12345',
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(apiLogRepository.logApiRequest).not.toHaveBeenCalled();
    });
    it('should NOT log /ready requests to the database', async () => {
        await server.inject({
            method: 'GET',
            url: '/ready',
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(apiLogRepository.logApiRequest).not.toHaveBeenCalled();
    });
});
