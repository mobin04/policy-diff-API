"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const numericParser_1 = require("../numericParser");
describe('numericParser', () => {
    it('should extract integers and decimals', () => {
        const text = 'The price is 100 and the weight is 1.5kg';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(2);
        expect(tokens[0].numericValue).toBe(100);
        expect(tokens[1].numericValue).toBe(1.5);
    });
    it('should normalize thousand separators', () => {
        const text = 'Total: 1,234,567.89';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(1);
        expect(tokens[0].numericValue).toBe(1234567.89);
    });
    it('should ignore currency symbols', () => {
        const text = 'Prices: $10, €20, £30.50';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(3);
        expect(tokens[0].numericValue).toBe(10);
        expect(tokens[1].numericValue).toBe(20);
        expect(tokens[2].numericValue).toBe(30.5);
    });
    it('should normalize percentages', () => {
        const text = 'Discount: 15% or 20.5 %';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(2);
        expect(tokens[0].numericValue).toBe(15);
        expect(tokens[1].numericValue).toBe(20.5);
    });
    it('should ignore version numbers (multiple dots)', () => {
        const text = 'Version 1.2.3 and 4.5.6.7 are released';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(0);
    });
    it('should ignore tokens with multiple dots even if not digits', () => {
        const text = 'Ref..123 or 1.2.3.4';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(0);
    });
    it('should preserve extraction order', () => {
        const text = 'First 10, then $20.50, finally 30%';
        const tokens = (0, numericParser_1.extractNumericTokens)(text);
        expect(tokens).toHaveLength(3);
        expect(tokens[0].numericValue).toBe(10);
        expect(tokens[1].numericValue).toBe(20.5);
        expect(tokens[2].numericValue).toBe(30);
    });
});
