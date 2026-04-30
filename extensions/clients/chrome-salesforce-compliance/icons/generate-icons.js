/**
 * Generates PNG icons for the Chrome extension from an SVG source.
 * Run: node icons/generate-icons.js
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#4338ca"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#00000033"/>
    </filter>
  </defs>

  <!-- Background rounded square -->
  <rect width="128" height="128" rx="26" fill="url(#grad)"/>

  <!-- Shield body -->
  <path
    d="M64 18 L96 32 L96 66 Q96 90 64 104 Q32 90 32 66 L32 32 Z"
    fill="white"
    filter="url(#shadow)"
    opacity="0.97"
  />

  <!-- Checkmark (stroke) -->
  <path
    d="M46 65 L59 78 L84 50"
    stroke="#4338ca"
    stroke-width="9"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
</svg>
`;

const HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body { background: transparent; }
  svg { display: block; }
</style>
</head>
<body>${SVG}</body>
</html>`;

const SIZES = [16, 32, 48, 128];
const OUT_DIR = path.dirname(__filename);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(HTML);
    await page.evaluate((s) => {
      const svg = document.querySelector("svg");
      svg.setAttribute("width", s);
      svg.setAttribute("height", s);
    }, size);

    const outPath = path.join(OUT_DIR, `icon${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(`✓ icon${size}.png`);
  }

  await browser.close();
  console.log("Done.");
})();
