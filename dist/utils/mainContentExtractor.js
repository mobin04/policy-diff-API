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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMainContent = extractMainContent;
const cheerio = __importStar(require("cheerio"));
const hash_1 = require("./hash");
/**
 * Extract the primary policy content from raw HTML
 *
 * @param html - Raw HTML string
 * @returns IsolationResult containing sanitized content and metadata
 */
function extractMainContent(html) {
    const $ = cheerio.load(html);
    // 1. Remove irrelevant elements globally
    const unwantedElements = [
        'header',
        'nav',
        'footer',
        'aside',
        'script',
        'style',
        'noscript',
        'iframe',
        'button',
        'form',
    ];
    $(unwantedElements.join(',')).remove();
    // 2. Candidate containers in priority order
    const candidates = ['main', 'article', '[role="main"]', '#content', '#main', '.content', '.policy', '.terms'];
    let bestCandidate = null;
    let maxTextLength = 0;
    let selectedSelector = '';
    let candidateCount = 0;
    for (const selector of candidates) {
        const elements = $(selector);
        elements.each((_, element) => {
            candidateCount++;
            const $el = $(element);
            const text = $el.text();
            const length = text.replace(/\s+/g, '').length;
            // Ignore if length < 500 characters
            if (length >= 500) {
                if (length > maxTextLength) {
                    maxTextLength = length;
                    bestCandidate = $el;
                    selectedSelector = selector;
                }
            }
        });
    }
    // 3. Fallback to body if no suitable candidate found
    let content = '';
    let usedFallback = false;
    if (bestCandidate) {
        content = bestCandidate.html() || '';
    }
    else {
        content = $('body').html() || html;
        usedFallback = true;
        selectedSelector = 'body';
    }
    const textLength = content.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length;
    const fingerprint = (0, hash_1.generateHash)(`${selectedSelector}${textLength}`);
    return {
        content,
        selectedSelector,
        textLength,
        candidateCount,
        usedFallback,
        fingerprint,
    };
}
