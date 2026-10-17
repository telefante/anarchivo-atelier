#!/usr/bin/env node
// Add an image to 08-imagenes/ and auto-generate imagenes.yaml entry.
// Usage: npm run add-image -- ./imagen.jpg "Description" "tag1,tag2"

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargar } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = cargar().raiz;
const SUELTAS = cargar().carpetas.imagenes;

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: npm run add-image -- <image-path> [description] [tags]');
  console.error('Example: npm run add-image -- ./foto.jpg "Mi foto" "video,live-cinema"');
  process.exit(1);
}

const [imagePath, description = '', tagsStr = ''] = args;
const imageFile = path.resolve(imagePath);
const imageName = path.basename(imageFile);
const imagesDir = path.join(ROOT, SUELTAS);

// Parse tags
const tags = tagsStr
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);

const exists = async (p) => !!(await fs.stat(p).catch(() => null));

async function main() {
  try {
    // Validate input image exists
    if (!await exists(imageFile)) {
      console.error(`❌ Image not found: ${imageFile}`);
      process.exit(1);
    }

    // Create 08-imagenes/ directory if needed
    if (!await exists(imagesDir)) {
      await fs.mkdir(imagesDir, { recursive: true });
      console.log(`✓ Created ${SUELTAS}/`);
    }

    // Check if file already exists in target
    const targetPath = path.join(imagesDir, imageName);
    if (await exists(targetPath)) {
      console.warn(`⚠ File already exists: ${SUELTAS}/${imageName}`);
    } else {
      // Copy image
      await fs.copyFile(imageFile, targetPath);
      console.log(`✓ Copied: ${imageName}`);
    }

    // Read or create imagenes.yaml
    const yamlPath = path.join(imagesDir, 'imagenes.yaml');
    let yamlText = '';
    if (await exists(yamlPath)) {
      yamlText = await fs.readFile(yamlPath, 'utf8');
    }

    // Parse existing YAML
    const entries = parseImagenesYaml(yamlText);

    // Add new entry (overwrite if exists)
    const today = new Date().toISOString().split('T')[0];
    entries[imageName] = {
      alt: description || `Image ${imageName}`,
      tags: tags.length > 0 ? tags : [],
      relacionadas: [],
      fecha: today,
      fuente: ''
    };

    // Regenerate YAML
    const newYaml = generateImagenesYaml(entries);
    await fs.writeFile(yamlPath, newYaml, 'utf8');
    console.log(`✓ Updated: ${SUELTAS}/imagenes.yaml`);
    console.log(`\n📌 Entry added:`);
    console.log(`   ${imageName}`);
    if (description) console.log(`   alt: ${description}`);
    if (tags.length > 0) console.log(`   tags: ${tags.join(', ')}`);
    console.log(`\n✓ Ready for npm run build`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

function parseImagenesYaml(text) {
  const out = {};
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^(\S.*?):\s*$/);
    if (top) { cur = out[top[1]] = {}; continue; }
    const field = line.match(/^\s{2}([\w-]+):\s*(.*)$/);
    if (field && cur) {
      const [, key, rawVal] = field;
      cur[key] = rawVal.trim().startsWith('[')
        ? parseFlowArray(rawVal)
        : (rawVal.trim() ? stripQuotes(rawVal) : '');
    }
  }
  return out;
}

function stripQuotes(s) {
  return s.trim().replace(/^["']|["']$/g, '');
}

function parseFlowArray(v) {
  const inner = v.trim().replace(/^\[|\]$/g, '');
  if (!inner.trim()) return [];
  return inner.split(',').map(stripQuotes).filter(Boolean);
}

function generateImagenesYaml(entries) {
  const lines = [];
  for (const [filename, data] of Object.entries(entries)) {
    lines.push(`${filename}:`);
    lines.push(`  alt: "${data.alt || ''}"`);
    lines.push(`  tags: [${(data.tags || []).map(t => `"${t}"`).join(', ')}]`);
    lines.push(`  relacionadas: [${(data.relacionadas || []).map(t => `"${t}"`).join(', ')}]`);
    lines.push(`  fecha: ${data.fecha || ''}`);
    lines.push(`  fuente: "${data.fuente || ''}"`);
    if (data.nota) lines.push(`  nota: "${data.nota}"`); // la escribe la Mesa: no perderla al regenerar
    lines.push('');
  }
  return lines.join('\n');
}

main();
