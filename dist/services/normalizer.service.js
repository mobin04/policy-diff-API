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
exports.normalizeHtml = normalizeHtml;
exports.normalizeContent = normalizeContent;
const cheerio = __importStar(require("cheerio"));
const dateMasker_1 = require("../utils/dateMasker");
/**
 * Normalizes structural elements (tables, lists) into stable canonical text.
 *
 * WHY: HTML tables and lists often produce unstable diff noise due to DOM formatting shifts.
 * This converts them into a stable Markdown-like format before hashing and section extraction.
 */
function normalizeStructuralElements($) {
    // 1. Table Normalization
    $('table').each((_, table) => {
        const rows = [];
        $(table)
            .find('tr')
            .each((_, tr) => {
            const cells = [];
            $(tr)
                .find('th, td')
                .each((_, cell) => {
                const cellText = $(cell).text().replace(/\s+/g, ' ').trim();
                cells.push(cellText);
            });
            if (cells.length > 0) {
                // Canonical form: | cell1 | cell2 |
                rows.push(`| ${cells.join(' | ')} |`);
            }
        });
        const canonicalTable = rows.join('\n');
        $(table).replaceWith(`<div data-policydiff-table="true">${canonicalTable}</div>`);
    });
    // 2. List Normalization
    function processList(list, level) {
        const $list = $(list);
        const isOrdered = $list.is('ol');
        const items = [];
        $list.children('li').each((i, li) => {
            const $li = $(li);
            const indent = '  '.repeat(level);
            const prefix = isOrdered ? `${i + 1}. ` : '- ';
            // Extract text content only for the current LI, ignoring nested lists
            const $clone = $li.clone();
            $clone.children('ul, ol').remove();
            const itemText = $clone.text().replace(/\s+/g, ' ').trim();
            let result = `${indent}${prefix}${itemText}`;
            // Handle nested lists
            $li.children('ul, ol').each((_, nested) => {
                result += '\n' + processList(nested, level + 1);
            });
            items.push(result);
        });
        return items.join('\n');
    }
    $('ul, ol').each((_, list) => {
        // Only process top-level lists to avoid duplicate processing in recursive calls
        if ($(list).parents('li').length === 0) {
            const canonicalList = processList(list, 0);
            $(list).replaceWith(`<div data-policydiff-list="true">${canonicalList}</div>`);
        }
    });
}
/**
 * Performs structural and cleanup normalization on HTML.
 */
function normalizeHtml(html) {
    const maskedHtml = (0, dateMasker_1.maskTemporalNoise)(html);
    const $ = cheerio.load(maskedHtml);
    // 1. Remove unwanted tags (HTML cleaning)
    $('script, style, noscript').remove();
    // 2. Structural Normalization (Tables, Lists)
    normalizeStructuralElements($);
    return $.html();
}
/**
 * Extracts normalized text content from HTML for hashing.
 * Preserves structural markers (newlines and indentation) to ensure
 * stable hashing of tables and lists.
 */
function normalizeContent(html) {
    const normalizedHtml = normalizeHtml(html);
    const $ = cheerio.load(normalizedHtml);
    // Extract text from body or root
    const $body = $('body');
    const text = $body.length > 0 ? $body.text() : $.root().text();
    // Normalize whitespace line-by-line to preserve structural indentation
    return text
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0)
        .join('\n')
        .trim();
}
