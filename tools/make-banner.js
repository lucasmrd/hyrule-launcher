// Gera docs/banner.svg (animado, fontes embutidas) e docs/divider.svg para o README. Uso: node tools/make-banner.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const font = (f) => fs.readFileSync(path.join(root, 'src', 'assets', 'fonts', f)).toString('base64');
const EYE = 'M26 106 Q100 30 174 106 M38 106 Q100 150 162 106 M70 66 L60 42 M100 56 L100 28 M130 66 L140 42 M100 146 Q86 168 100 184 Q114 168 100 146 Z';

// espíritos dourados/azuis subindo (posições fixas para o SVG ser determinístico)
const motes = Array.from({ length: 26 }, (_, i) => {
  const x = (i * 197 + 61) % 1240 + 20, r = 1.2 + ((i * 7) % 5) * 0.45;
  const dur = 7 + ((i * 3) % 6), delay = -((i * 1.37) % dur).toFixed(2);
  const color = i % 4 === 0 ? '#7fe6f8' : '#f3d27a';
  return `<circle class="m" cx="${x}" cy="380" r="${r}" fill="${color}" style="animation-duration:${dur}s;animation-delay:${delay}s"/>`;
}).join('\n    ');

// "circuitos" Sheikah discretos nas laterais
const circuits = [
  'M0 70 H120 L150 100 H260', 'M0 290 H90 L120 260 H210 L230 240', 'M60 360 V320 L90 290',
  'M1280 80 H1150 L1120 110 H1010', 'M1280 280 H1180 L1150 250 H1060 L1040 230', 'M1210 0 V40 L1180 70',
].map((d) => `<path d="${d}"/>`).join('');

const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="360" viewBox="0 0 1280 360">
  <style>
    @font-face { font-family: 'Cinzel'; font-weight: 600; src: url(data:font/woff2;base64,${font('cinzel-latin-600-normal.woff2')}) format('woff2'); }
    @font-face { font-family: 'Inter'; font-weight: 500; src: url(data:font/woff2;base64,${font('inter-latin-500-normal.woff2')}) format('woff2'); }
    .title { font: 600 66px 'Cinzel', Georgia, serif; letter-spacing: 14px; fill: url(#gold); opacity: 0; animation: title 1.6s .9s cubic-bezier(.22,.8,.24,1) forwards; }
    .sub { font: 500 20px 'Inter', 'Segoe UI', sans-serif; letter-spacing: 1px; fill: #a7adb6; opacity: 0; animation: fade 1.2s 1.6s ease forwards; }
    .pill { font: 500 14px 'Inter', 'Segoe UI', sans-serif; letter-spacing: 2px; fill: #f0cf6e; }
    .pills { opacity: 0; animation: fade 1.2s 2.1s ease forwards; }
    .eye path, .eye circle.l { stroke-dasharray: 420; stroke-dashoffset: 420; animation: draw 1.6s .2s cubic-bezier(.65,0,.35,1) forwards; }
    .eye .dot { transform-origin: 100px 104px; transform: scale(0); animation: pop .6s 1.4s cubic-bezier(.22,.8,.24,1) forwards; }
    .halo { transform-origin: 640px 92px; animation: halo 4s 1.6s ease-in-out infinite; opacity: .0; }
    .m { animation-name: rise; animation-timing-function: linear; animation-iteration-count: infinite; }
    .circ { stroke-dasharray: 600; stroke-dashoffset: 600; animation: draw 3s .4s ease forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @keyframes pop { 70% { transform: scale(1.3); } 100% { transform: scale(1); } }
    @keyframes title { from { opacity: 0; letter-spacing: 30px; } to { opacity: 1; letter-spacing: 14px; } }
    @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes halo { 0%, 100% { opacity: .35; transform: scale(.92); } 50% { opacity: .75; transform: scale(1.08); } }
    @keyframes rise { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: .9; } 85% { opacity: .5; } 100% { transform: translateY(-420px); opacity: 0; } }
  </style>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e171e"/><stop offset="1" stop-color="#07090c"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc8c"/><stop offset="1" stop-color="#c79a3c"/></linearGradient>
    <radialGradient id="cyan" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#4fd8f2" stop-opacity=".55"/><stop offset="1" stop-color="#4fd8f2" stop-opacity="0"/></radialGradient>
    <radialGradient id="warm" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f0cf6e" stop-opacity=".16"/><stop offset="1" stop-color="#f0cf6e" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="card"><rect width="1280" height="360" rx="22"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect width="1280" height="360" fill="url(#bg)"/>
    <ellipse cx="640" cy="120" rx="420" ry="200" fill="url(#warm)"/>
    <g class="circ" fill="none" stroke="#4fd8f2" stroke-opacity=".22" stroke-width="1.5">${circuits}</g>
    ${motes}
    <ellipse class="halo" cx="640" cy="92" rx="120" ry="80" fill="url(#cyan)"/>
    <g class="eye" transform="translate(593 42) scale(.47)" fill="none" stroke="#7fe6f8" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)">
      <path d="${EYE}"/><circle class="l" cx="100" cy="104" r="21"/><circle class="dot" cx="100" cy="104" r="9" fill="#bff4ff" stroke="none"/>
    </g>
    <text class="title" x="647" y="214" text-anchor="middle">HYRULE LAUNCHER</text>
    <text class="sub" x="640" y="256" text-anchor="middle">Um launcher no estilo Steam para Zelda: Breath of the Wild no Cemu</text>
    <g class="pills">
      <rect x="436" y="285" width="408" height="34" rx="17" fill="#f0cf6e" fill-opacity=".08" stroke="#f0cf6e" stroke-opacity=".35"/>
      <text class="pill" x="640" y="307" text-anchor="middle">CEMU 1.X &amp; 2.X  ·  WINDOWS  ·  100% VISUAL</text>
    </g>
  </g>
  <rect x=".75" y=".75" width="1278.5" height="358.5" rx="21.5" fill="none" stroke="#e2c26f" stroke-opacity=".45" stroke-width="1.5"/>
</svg>
`;

const divider = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="28" viewBox="0 0 1280 28">
  <defs>
    <linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="#d8b765" stop-opacity="0"/><stop offset="1" stop-color="#d8b765"/></linearGradient>
    <linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="#d8b765"/><stop offset="1" stop-color="#d8b765" stop-opacity="0"/></linearGradient>
  </defs>
  <rect x="140" y="13.25" width="470" height="1.5" fill="url(#l)"/>
  <rect x="670" y="13.25" width="470" height="1.5" fill="url(#r)"/>
  <path d="M640 3 L651 14 L640 25 L629 14 Z" fill="none" stroke="#d8b765" stroke-width="1.5"/>
  <circle cx="640" cy="14" r="3.2" fill="#4fd8f2"/>
  <path d="M612 14 L618 9 L624 14 L618 19 Z M656 14 L662 9 L668 14 L662 19 Z" fill="#d8b765" fill-opacity=".8"/>
</svg>
`;

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'banner.svg'), banner);
fs.writeFileSync(path.join(root, 'docs', 'divider.svg'), divider);
console.log(`banner.svg ${(banner.length / 1024).toFixed(0)} KB, divider.svg ok`);
