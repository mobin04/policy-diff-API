import { FastifyReply, FastifyRequest } from "fastify";

export const checkController = async (request: FastifyRequest, reply: FastifyReply) => {
    return { message: "Check endpoint" };
};
