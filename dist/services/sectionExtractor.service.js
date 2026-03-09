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
exports.extractSections = extractSections;
const cheerio = __importStar(require("cheerio"));
const hash_service_1 = require("./hash.service");
/**
 * Normalize content for consistent hashing
 * Removes extra whitespace and normalizes for comparison
 */
function normalizeForHash(content) {
    return content.toLowerCase().replace(/\s+/g, ' ').trim();
}
/**
 * Extract sections from HTML and compute content hashes
 *
 * @param html - Raw HTML string
 * @returns Array of sections with title, content, and hash
 */
function extractSections(html) {
    const $ = cheerio.load(html);
    const partialSections = [];
    let currentSection = { title: 'general', content: '' };
    function traverse(node) {
        if (!node || typeof node !== 'object')
            return;
        const nodeObj = node;
        const type = typeof nodeObj.type === 'string' ? nodeObj.type : undefined;
        const name = typeof nodeObj.name === 'string' ? nodeObj.name : undefined;
        const children = Array.isArray(nodeObj.children) ? nodeObj.children : undefined;
        // Skip script and style elements
        if (type === 'script' || type === 'style' || name === 'script' || name === 'style') {
            return;
        }
        if (type === 'text') {
            const text = $(node)
                .text()
                .replace(/\s+/g, ' ')
                .trim();
            if (text) {
                currentSection.content += (currentSection.content ? ' ' : '') + text;
            }
        }
        else if (type === 'tag') {
            if (name && ['h1', 'h2', 'h3'].includes(name)) {
                // Push previous section
                currentSection.content = currentSection.content.replace(/\s+/g, ' ').trim();
                if (currentSection.content || currentSection.title !== 'general') {
                    partialSections.push(currentSection);
                }
                // Start new section
                currentSection = {
                    title: $(node)
                        .text()
                        .toLowerCase()
                        .trim(),
                    content: '',
                };
            }
            else if (children) {
                children.forEach((child) => traverse(child));
            }
        }
        else if (children) {
            // Handle root or other node types
            children.forEach((child) => traverse(child));
        }
    }
    const body = $('body')[0];
    if (body) {
        traverse(body);
    }
    else {
        // Fallback if no body tag (e.g. partial HTML)
        const root = $.root()[0];
        if (root) {
            traverse(root);
        }
    }
    // Push the last section
    currentSection.content = currentSection.content.replace(/\s+/g, ' ').trim();
    if (currentSection.content || currentSection.title !== 'general') {
        partialSections.push(currentSection);
    }
    // Convert to full sections with hashes
    const sections = partialSections.map((partial) => ({
        title: partial.title,
        content: partial.content,
        hash: (0, hash_service_1.generateDateMaskedHash)(normalizeForHash(partial.content)),
    }));
    return sections;
}
