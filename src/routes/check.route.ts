import { FastifyInstance } from "fastify";
import { checkController } from "../controllers/check.controller";

export async function checkRoutes(fastify: FastifyInstance) {
    fastify.get("/check", checkController);
}
