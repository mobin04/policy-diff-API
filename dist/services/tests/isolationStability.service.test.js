"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const isolationStability_service_1 = require("../isolationStability.service");
describe('isolationStability.service', () => {
    describe('detectIsolationDrift', () => {
        it('should return false if previous fingerprint is null', () => {
            const current = 'fingerprint-123';
            expect((0, isolationStability_service_1.detectIsolationDrift)(null, current)).toBe(false);
        });
        it('should return false if fingerprints are identical', () => {
            const fingerprint = 'stable-fingerprint';
            expect((0, isolationStability_service_1.detectIsolationDrift)(fingerprint, fingerprint)).toBe(false);
        });
        it('should return true if fingerprints differ', () => {
            const previous = 'old-fingerprint';
            const current = 'new-fingerprint';
            expect((0, isolationStability_service_1.detectIsolationDrift)(previous, current)).toBe(true);
        });
    });
});
