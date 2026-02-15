import * as cheerio from 'cheerio';
import { Section } from '../types';

export function extractSections(html: string): Section[] {
  const $ = cheerio.load(html);
  const sections: Section[] = [];
  let currentSection: Section = { title: 'general', content: '' };

  function traverse(node: any) {
    if (node.type === 'script' || node.type === 'style' || node.name === 'script' || node.name === 'style') {
      return;
    }

    if (node.type === 'text') {
      const text = $(node).text().replace(/\s+/g, ' ').trim();
      if (text) {
        currentSection.content += (currentSection.content ? ' ' : '') + text;
      }
    } else if (node.type === 'tag') {
      if (['h1', 'h2', 'h3'].includes(node.name)) {
        // Push previous section
        currentSection.content = currentSection.content.replace(/\s+/g, ' ').trim();
        if (currentSection.content || currentSection.title !== 'general') {
          sections.push(currentSection);
        }

        // Start new section
        currentSection = {
          title: $(node).text().toLowerCase().trim(),
          content: '',
        };
      } else {
        if (node.children) {
          node.children.forEach((child: any) => traverse(child));
        }
      }
    } else if (node.children) {
      // Handle root or other node types
      node.children.forEach((child: any) => traverse(child));
    }
  }

  const body = $('body')[0];
  if (body) {
    traverse(body);
  } else {
    // Fallback if no body tag (e.g. partial HTML)
    if ($.root()[0]) {
      traverse($.root()[0]);
    }
  }

  // Push the last section
  currentSection.content = currentSection.content.replace(/\s+/g, ' ').trim();
  if (currentSection.content || currentSection.title !== 'general') {
    sections.push(currentSection);
  }
  console.log(sections);
  return sections;
}
