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
exports.extractPrimaryContent = extractPrimaryContent;
const cheerio = __importStar(require("cheerio"));
const errors_1 = require("../errors");
/**
 * Hardened Content Extraction Layer
 *
 * WHY THIS IS NECESSARY:
 * - UI fragments (modals, alerts, popups) often contain high text density but are not part of the policy.
 * - Previous density-only heuristics were prone to selecting transient interface components.
 * - This layer enforces structural requirements (headings, paragraphs) to ensure the selected
 *   container represents a long-form document rather than a UI element.
 */
const UI_EXCLUSION_SELECTORS = [
    '[role="dialog"]',
    '[role="alert"]',
    '[aria-modal="true"]',
    '[aria-hidden="true"]'
];
const UI_EXCLUSION_PATTERNS = [
    'modal', 'dialog', 'overlay', 'popup', 'toast', 'alert',
    'notification', 'snackbar', 'banner', 'close', 'loading', 'spinner'
];
const TEXT_EXCLUSION_PREFIXES = ['Processing', 'Error', 'Loading', 'Close'];
/**
 * Validate if a container meets the minimum structural requirements for a policy document.
 */
function isStructurallyValid(headingCount, paragraphCount, textLength) {
    return headingCount >= 2 && paragraphCount >= 3 && textLength >= 800;
}
/**
 * Check if a container starts with transient UI text.
 */
function startsWithUIText(text) {
    const trimmed = text.trim();
    return TEXT_EXCLUSION_PREFIXES.some(prefix => trimmed.startsWith(prefix));
}
function extractPrimaryContent(html) {
    const $ = cheerio.load(html);
    // 1. HARD EXCLUSIONS: Remove known UI/noise components before any analysis
    UI_EXCLUSION_SELECTORS.forEach(selector => $(selector).remove());
    $('[id], [class]').each((_, el) => {
        const $el = $(el);
        const id = $el.attr('id') || '';
        const className = $el.attr('class') || '';
        const isUI = UI_EXCLUSION_PATTERNS.some(pattern => id.toLowerCase().includes(pattern) || className.toLowerCase().includes(pattern));
        if (isUI) {
            $el.remove();
        }
    });
    // LAYER 1: Semantic Containers
    const semanticSelectors = ['main', 'article', '[role="main"]'];
    for (const selector of semanticSelectors) {
        const containers = $(selector);
        let bestSemantic = null;
        containers.each((_, el) => {
            const $el = $(el);
            const text = $el.text();
            const textLength = text.length;
            if (startsWithUIText(text))
                return;
            const headingCount = $el.find('h1, h2, h3, h4, h5, h6').length;
            const paragraphCount = $el.find('p').length;
            if (isStructurallyValid(headingCount, paragraphCount, textLength)) {
                if (!bestSemantic || textLength > bestSemantic.length) {
                    bestSemantic = {
                        content: $el.html() || '',
                        strategy: 'semantic',
                        length: textLength,
                        headingCount,
                        paragraphCount
                    };
                }
            }
        });
        if (bestSemantic)
            return bestSemantic;
    }
    // LAYER 2: Heuristic Layer
    // Remove additional layout elements if semantic layer failed
    $('nav, header, footer, aside').remove();
    let bestHeuristic = null;
    let highestScore = -1;
    let lastRejectionReason = 'No suitable container found';
    $('div, section').each((_, el) => {
        const $el = $(el);
        const text = $el.text();
        const textLength = text.length;
        if (startsWithUIText(text)) {
            lastRejectionReason = 'Container text matches UI exclusion pattern';
            return;
        }
        const headingCount = $el.find('h1, h2, h3, h4, h5, h6').length;
        const paragraphCount = $el.find('p').length;
        if (!isStructurallyValid(headingCount, paragraphCount, textLength)) {
            if (textLength > 500) {
                lastRejectionReason = `Structural validation failed (H:${headingCount}, P:${paragraphCount}, L:${textLength})`;
            }
            return;
        }
        // Strengthened Scoring Formula:
        // score = headingCount * 500 + paragraphCount * 100 + textLength * 0.5
        const score = (headingCount * 500) + (paragraphCount * 100) + (textLength * 0.5);
        if (score > highestScore) {
            highestScore = score;
            bestHeuristic = {
                content: $el.html() || '',
                strategy: 'heuristic',
                length: textLength,
                headingCount,
                paragraphCount
            };
        }
    });
    if (bestHeuristic)
        return bestHeuristic;
    // FALLBACK: If body is valid but no container was picked
    const $body = $('body');
    const bodyText = $body.text();
    const bodyH = $body.find('h1, h2, h3, h4, h5, h6').length;
    const bodyP = $body.find('p').length;
    const bodyL = bodyText.length;
    if (isStructurallyValid(bodyH, bodyP, bodyL) && !startsWithUIText(bodyText)) {
        return {
            content: $body.html() || '',
            strategy: 'heuristic',
            length: bodyL,
            headingCount: bodyH,
            paragraphCount: bodyP
        };
    }
    throw new errors_1.ContentExtractionFailedError(lastRejectionReason);
}
