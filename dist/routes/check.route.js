"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRoutes = checkRoutes;
const check_controller_1 = require("../controllers/check.controller");
async function checkRoutes(fastify) {
    // Apply API key auth to all routes in this plugin
    fastify.addHook('onRequest', fastify.apiKeyAuth);
    fastify.post('/check', check_controller_1.checkController);
}
