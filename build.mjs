import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const css = read('src/styles.css');
const scripts = [
  read('src/qr.js'),
  read('src/audio.js'),
  read('src/art.js'),
  read('src/data.js'),
  read('src/sync.js'),
  read('src/games.js'),
  read('src/app.js'),
].join('\n\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Thanksgiving AI Game Night — 6 Interactive Family Games</title>
  <meta name="description" content="Six interactive AI Thanksgiving games for kids and adults: Prompt Clone, Turkey Court, Prompt Panic, Pass the Gobble Bomb, Spot the Bot, and Feast Showdown — with QR phone joining." />
  <style>
${css}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
${scripts}
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, 'index.html'), html, 'utf8');
console.log(`Built index.html (${(html.length / 1024).toFixed(1)} KB)`);
