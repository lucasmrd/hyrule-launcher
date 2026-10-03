'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const app = $('#app');
const playBtn = $('#play');
const playLabel = $('.play-label', playBtn);
let info = null;
let winVisible = true;
let state = hyrule.cemuRunningAtStart ? 'running' : 'idle'; // idle | loading | running
let shots = [];

/* ================= Formatação ================= */
const fmtHours = (min) => {
  const total = Math.floor(min), h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
};
function fmtDate(ms) {
  if (!ms) return 'Nunca';
  const d = new Date(ms), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('pt-BR', opts);
}
function countUp(el, from, to, fmt, ms = 1400) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ================= Render ================= */
let shownMinutes = 0;
// artes extraídas do jogo do usuário (hero, logo, ícone) e a música
let artKey = '';
function applyArt(art) {
  if (!art || art.hero === artKey) return Promise.resolve();
  artKey = art.hero;
  $$('img[data-art]').forEach((img) => { if (art[img.dataset.art]) img.src = art[img.dataset.art]; });
  music.setSource(art.music);
  return $('.hero-art').decode().catch(() => {});
}

function render(next) {
  if (next.needsSetup) return;
  applyArt(next.art);
  const first = !info;
  info = next;
  $('#last-played').textContent = fmtDate(info.lastPlayed);
  $('#emu-ver').textContent = `Cemu ${info.cemuVersion}`;
  $('#emu-status').textContent = `Cemu ${info.cemuVersion} · ${info.installed ? 'pronto' : 'não encontrado'}`;
  if (first || info.playMinutes !== shownMinutes) {
    countUp($('#play-time'), first ? 0 : shownMinutes, info.playMinutes, fmtHours, first ? 1800 : 1200);
    shownMinutes = info.playMinutes;
  }

  const tid = info.titleId ? `${info.titleId.slice(0, 8)}-${info.titleId.slice(8)}` : '—';
  const rows = [
    ['Distribuidora', info.publisher], ['Desenvolvedora', 'Nintendo EPD'], ['Lançamento', '3 de mar. de 2017'],
    ['Plataforma', 'Wii U'], ['Região', info.region], ['Código', info.productCode || '—'], ['Title ID', tid],
    ['Emulador', `Cemu ${info.cemuVersion}`],
  ];
  $('#details').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');

  $('#pack-count').textContent = info.packs.length;
  $('#packs').innerHTML = info.packs.length
    ? info.packs.map((p) => `<li><span class="p-name">${esc(p.name)}</span><span class="p-cat">${esc(p.category)}</span></li>`).join('')
    : '<li class="empty">Nenhum graphic pack ativo</li>';

  if (first || shots.length !== info.screenshots.length) renderShots(info.screenshots);
  if (!info.installed) playBtn.disabled = true;
  setState(info.running ? 'running' : state === 'loading' ? 'loading' : 'idle');
}

function renderShots(list) {
  shots = list;
  $('#shot-count').textContent = list.length ? `(${list.length})` : '';
  const grid = $('#shot-grid');
  const top = list.slice(0, 5);
  if (!top.length) {
    grid.style.aspectRatio = 'auto';
    grid.innerHTML = '<div class="empty">Nenhuma captura ainda. Use a tecla de captura do Cemu durante o jogo.</div>';
  } else {
    if (top.length < 5) {
      grid.style.gridTemplateColumns = `repeat(${top.length}, 1fr)`;
      grid.style.gridTemplateRows = '1fr';
      grid.style.aspectRatio = `${16 * top.length} / 9`;
    }
    grid.innerHTML = top.map((s, i) => thumb(s, i)).join('');
    if (top.length < 5) $$('.shot', grid).forEach((el) => (el.style.gridRow = 'auto'));
  }
  $('#gallery').innerHTML = list.length
    ? list.map((s, i) => thumb(s, i)).join('')
    : '<div class="empty">Nenhuma captura encontrada na pasta do Cemu.</div>';
  $$('#gallery .shot').forEach((el, i) => (el.style.animationDelay = `${Math.min(i, 14) * 45}ms`));
}
const thumb = (s, i) =>
  `<div class="shot" data-i="${i}"><img src="${s.url}" loading="lazy" decoding="async" alt=""></div>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ================= Música (vinheta de abertura do próprio jogo) ================= */
// Desligada por padrão; a escolha fica salva. Pausa sozinha enquanto o jogo está aberto ou a janela minimizada.
const music = (() => {
  const btn = $('#music-btn');
  const audio = new Audio(); // a vinheta é extraída da cópia do jogo do usuário
  audio.preload = 'auto';
  audio.volume = 0;
  const wrap = $('#music-wrap'), pop = $('#vol-pop'), slider = $('#vol');
  let wanted = !!hyrule.prefs.music, audible = false, fadeT, gapT;
  let vol = typeof hyrule.prefs.volume === 'number' ? hyrule.prefs.volume : 0.7;
  const gain = () => vol * vol; // curva perceptiva: 50% soa como "metade"
  const saveVol = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => hyrule.setPrefs({ volume: vol }), 250); }; })();

  // a vinheta tem ~19s e termina em silêncio; respira um pouco antes de repetir
  audio.addEventListener('ended', () => {
    if (!audible) return;
    gapT = setTimeout(() => { if (audible) { audio.currentTime = 0; audio.play().catch(() => {}); } }, 1500 + Math.random() * 2500);
  });

  // fade por tempo decorrido (funciona mesmo com timers desacelerados em segundo plano)
  function fade(to, ms, done) {
    clearTimeout(fadeT);
    const from = audio.volume, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) fadeT = setTimeout(step, 16); else if (done) done();
    };
    step();
  }

  function paint() {
    btn.classList.toggle('on', wanted);
    btn.classList.toggle('playing', audible && vol > 0);
    pop.classList.toggle('on', wanted);
    const pct = Math.round(vol * 100);
    slider.value = pct;
    slider.style.setProperty('--p', `${pct}%`);
    $('#vol-val').textContent = `${pct}%`;
    $('#vol-state').textContent = !wanted ? 'Música desligada' : audible ? 'Tocando' : 'Pausada durante o jogo';
  }

  function setVol(v) {
    vol = Math.max(0, Math.min(1, v));
    if (!wanted && vol > 0) { wanted = true; hyrule.setPrefs({ music: true }); }
    if (audible) { clearTimeout(fadeT); audio.volume = gain(); }
    saveVol();
    update();
  }

  // painel de volume: abre ao passar o mouse no fone, fecha ao sair
  let openT, closeT, dragging = false;
  const open = () => { clearTimeout(closeT); openT = setTimeout(() => pop.classList.add('open'), 180); };
  const close = () => { clearTimeout(openT); if (!dragging) closeT = setTimeout(() => pop.classList.remove('open'), 320); };
  wrap.addEventListener('mouseenter', open);
  wrap.addEventListener('mouseleave', close);
  slider.addEventListener('input', () => setVol(slider.value / 100));
  slider.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => { if (dragging) { dragging = false; if (!wrap.matches(':hover')) close(); } });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    clearTimeout(openT); clearTimeout(closeT); pop.classList.add('open');
    setVol(Math.round(vol * 100 + (e.deltaY < 0 ? 5 : -5)) / 100);
  }, { passive: false });

  function update() {
    const should = wanted && !!audio.src && winVisible && !document.hidden && state === 'idle';
    if (should !== audible) {
      audible = should;
      clearTimeout(gapT);
      if (should) {
        if (audio.ended) audio.currentTime = 0;
        audio.play().then(() => audible && fade(gain(), 1800)).catch(() => {});
      } else {
        fade(0, 600, () => { if (!audible) audio.pause(); });
      }
    }
    paint();
  }

  btn.addEventListener('click', () => {
    wanted = !wanted;
    hyrule.setPrefs({ music: wanted });
    update();
  });

  paint();
  function setSource(url) {
    if (!url || audio.src === url) return;
    audio.src = url;
    audible = false; // força recomeçar com a fonte nova
    update();
  }

  return { update, setVol, setSource, debug: () => ({ wanted, vol, audible, paused: audio.paused, volume: +audio.volume.toFixed(2), time: +audio.currentTime.toFixed(2) }) };
})();

/* ================= Tema claro / escuro ================= */
const root = document.documentElement;
const themeBtn = $('#theme-btn');
const syncThemeTip = () => (themeBtn.dataset.tip = root.dataset.theme === 'light' ? 'Tema escuro' : 'Tema claro');
syncThemeTip();
themeBtn.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light';
  hyrule.setPrefs({ theme: next });
  const apply = () => { root.dataset.theme = next; syncThemeTip(); };
  if (!document.startViewTransition) return apply();
  const r = themeBtn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
});

/* ================= Estado do botão ================= */
function setState(next) {
  state = next;
  playBtn.classList.toggle('loading', next === 'loading');
  playBtn.classList.toggle('running', next === 'running');
  playBtn.disabled = !info?.installed || next === 'loading';
  playLabel.textContent = next === 'loading' ? 'INICIANDO' : next === 'running' ? 'EM EXECUÇÃO' : 'JOGAR';
  playBtn.title = next === 'running' ? 'Ir para a janela do Cemu' : '';
  app.classList.toggle('running', next === 'running');
  $('#gi-sub').textContent = next === 'running' ? 'Em execução' : next === 'loading' ? 'Iniciando…' : 'Pronto para jogar';
  music.update();
}

/* ================= Jogar ================= */
const launchEl = $('#launch');
const launchText = $('#launch-text');
let launchTimer, textTimer;

function showLaunch() {
  launchEl.classList.add('show');
  const lines = ['Despertando o herói…', 'Acordando o Santuário da Ressurreição…', 'Carregando Hyrule…'];
  let i = 0;
  launchText.textContent = lines[0];
  textTimer = setInterval(() => {
    i = (i + 1) % lines.length;
    launchText.style.opacity = 0;
    setTimeout(() => { launchText.textContent = lines[i]; launchText.style.opacity = 1; }, 300);
  }, 2600);
}
function hideLaunch() {
  clearInterval(textTimer);
  clearTimeout(launchTimer);
  launchEl.classList.remove('show');
}

playBtn.addEventListener('click', async () => {
  if (state === 'running') return hyrule.focusCemu();
  if (state !== 'idle') return;
  setState('loading');
  showLaunch();
  await wait(700); // deixa a transição respirar antes do Cemu roubar o foco
  const r = await hyrule.launch();
  if (!r.ok) {
    hideLaunch(); setState('idle'); toast(r.error || 'Não foi possível iniciar o Cemu');
    return;
  }
  launchTimer = setTimeout(() => {
    hideLaunch();
    if (state === 'loading') { setState('idle'); toast('O Cemu está demorando para abrir…'); }
  }, 30000);
});

hyrule.onCemuState(({ running }) => {
  if (running) {
    setState('running');
    if (launchEl.classList.contains('show')) {
      clearInterval(textTimer);
      launchText.style.opacity = 0;
      setTimeout(() => { launchText.textContent = 'Boa jornada'; launchText.style.opacity = 1; }, 250);
      clearTimeout(launchTimer);
      setTimeout(hideLaunch, 1700);
    }
  } else {
    hideLaunch();
    setState('idle');
  }
});
hyrule.onCemuError((msg) => { hideLaunch(); setState('idle'); toast(msg); });
hyrule.onInfo(render);

/* ================= Abas ================= */
const ink = $('.tab-ink');
function moveInk(tab, instant) {
  if (instant) ink.style.transition = 'none';
  ink.style.width = `${tab.offsetWidth - 28}px`;
  ink.style.transform = `translateX(${tab.offsetLeft + 14}px)`;
  if (instant) requestAnimationFrame(() => (ink.style.transition = ''));
}
function showView(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  moveInk($(`.tab[data-view="${name}"]`));
  if (name === 'shots') {
    // reinicia a animação de entrada da galeria
    const g = $('#gallery');
    g.style.display = 'none'; void g.offsetHeight; g.style.display = '';
  }
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
$('#see-all').addEventListener('click', () => showView('shots'));
$('.game-item').addEventListener('click', () => showView('library'));

/* ================= Rolagem: parallax + barra fixa ================= */
const lib = $('#view-library');
const parallax = $('#hero-parallax');
const playbar = $('#playbar');
let scrollQueued = false;
lib.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const y = lib.scrollTop;
    parallax.style.transform = `translate3d(0, ${y * 0.35}px, 0)`;
    playbar.classList.toggle('stuck', y > $('.hero').offsetHeight - 4);
  });
}, { passive: true });

/* ================= Menu ================= */
const menu = $('#menu'), menuBtn = $('#menu-btn');
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); menuBtn.classList.toggle('open'); });
document.addEventListener('click', () => { menu.classList.remove('open'); menuBtn.classList.remove('open'); });
menu.addEventListener('click', (e) => {
  const act = e.target.dataset.act;
  if (act === 'cemu') { if (state === 'running') toast('O Cemu já está aberto'); else hyrule.openCemu(); }
  if (act === 'game') hyrule.openPath('game');
  if (act === 'emu') hyrule.openPath('cemu');
  if (act === 'shots') hyrule.openPath('screenshots');
  if (act === 'setup') reconfigure();
});

/* ================= Pesquisa (só filtra a lista) ================= */
$('.search input').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  $('.game-item').classList.toggle('hide', !!q && !'the legend of zelda breath of the wild botw'.includes(q));
});

/* ================= Visualizador de capturas ================= */
const lb = $('#lightbox'), lbImg = $('#lb-img');
let lbIndex = 0;
function openLb(i) { lbIndex = i; lbImg.src = shots[i].url; updLbCount(); lb.classList.add('show'); }
function closeLb() { lb.classList.remove('show'); }
function stepLb(d) {
  if (!shots.length) return;
  lbIndex = (lbIndex + d + shots.length) % shots.length;
  lbImg.classList.add('swap');
  setTimeout(() => {
    lbImg.src = shots[lbIndex].url;
    lbImg.decode().catch(() => {}).finally(() => lbImg.classList.remove('swap'));
    updLbCount();
  }, 180);
}
const updLbCount = () => ($('#lb-count').textContent = `${lbIndex + 1} / ${shots.length}`);
document.addEventListener('click', (e) => { const s = e.target.closest('.shot'); if (s) openLb(+s.dataset.i); });
lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
$('.lb-prev').addEventListener('click', () => stepLb(-1));
$('.lb-next').addEventListener('click', () => stepLb(1));
document.addEventListener('keydown', (e) => {
  if (!lb.classList.contains('show')) return;
  if (e.key === 'Escape') closeLb();
  if (e.key === 'ArrowLeft') stepLb(-1);
  if (e.key === 'ArrowRight') stepLb(1);
});

/* ================= Aviso ================= */
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ================= Partículas (espíritos dourados sobre a tapeçaria) ================= */
const motes = (() => {
  const cv = $('#motes'), ctx = cv.getContext('2d');
  const sprite = (rgb) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.18, `rgba(${rgb},.85)`); gr.addColorStop(.45, `rgba(${rgb},.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  };
  const gold = sprite('255,214,120'), cyan = sprite('110,225,255');
  let W = 0, H = 0, dpr = 1, parts = [], raf = 0, last = 0, on = false;
  const spawn = (p = {}, anywhere = false) => Object.assign(p, {
    x: Math.random() * W, y: anywhere ? Math.random() * H : H + 10 + Math.random() * 40,
    r: 1 + Math.random() * 2.4, vy: 10 + Math.random() * 26, amp: 8 + Math.random() * 22,
    f: .0004 + Math.random() * .0009, ph: Math.random() * 6.28, tw: .001 + Math.random() * .002,
    img: Math.random() < .22 ? cyan : gold,
  });
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(28, Math.min(80, Math.round((W * H) / 12000)));
    while (parts.length < n) parts.push(spawn({}, true));
    parts.length = n;
  }
  function frame(t) {
    const dt = Math.min(50, t - (last || t)) / 1000; last = t;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.y -= p.vy * dt;
      const x = p.x + Math.sin(p.ph + t * p.f) * p.amp;
      if (p.y < -20) spawn(p);
      const fade = Math.min(1, p.y / (H * .35)) * Math.min(1, (H - p.y) / 60 + .2);
      ctx.globalAlpha = Math.max(0, fade * (.45 + .55 * Math.sin(p.ph + t * p.tw) ** 2));
      const s = p.r * 7;
      ctx.drawImage(p.img, x - s / 2, p.y - s / 2, s, s);
    }
    raf = requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe(cv);
  return {
    start() { if (on) return; on = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { on = false; cancelAnimationFrame(raf); },
  };
})();
// só anima quando o hero está visível e a janela não está minimizada
let heroVisible = true;
const syncMotion = () => {
  (heroVisible && winVisible && !document.hidden) ? motes.start() : motes.stop();
  document.body.classList.toggle('idle', !winVisible || document.hidden);
  music.update();
};
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; syncMotion(); }).observe($('.hero'));
hyrule.onVisible((v) => { winVisible = v; syncMotion(); });
document.addEventListener('visibilitychange', syncMotion);

/* ================= Primeira configuração ================= */
const setupUI = (() => {
  const el = $('#setup');
  let cemuExe = null, game = null, done = () => {};
  const short = (p) => (p.length > 54 ? '…' + p.slice(-52) : p);
  function mark(id, cls, desc) {
    $(`#st-${id}`).className = `step ${cls}`;
    if (desc !== undefined) $(`#st-${id}-desc`).innerHTML = desc;
  }
  const refresh = () => ($('#setup-go').disabled = !(cemuExe && game));

  function setGame(g, auto) {
    game = g;
    mark('game', 'done', `<b>${auto ? 'Encontrado' : 'Selecionado'} · ${esc(g.region)}</b> · ${esc(short(g.dir))}`);
    $('#st-game-btn').hidden = false;
    $('#st-game-btn').textContent = 'Trocar';
    mark('art', 'active');
    refresh();
  }
  $('#st-cemu-btn').addEventListener('click', async () => {
    const r = await hyrule.pickCemu();
    if (!r.ok) { if (r.error) mark('cemu', 'active error', esc(r.error)); return; }
    cemuExe = r.exe;
    mark('cemu', 'done', `<b>Cemu ${esc(r.version || '')}</b> · ${esc(short(r.exe))}`);
    $('#st-cemu-btn').textContent = 'Trocar';
    if (r.game) setGame(r.game, true);
    else {
      game = null;
      mark('game', 'active error', 'Não achei o jogo nas pastas do Cemu. Escolha a pasta dele (a que tem <b>code</b>, <b>content</b> e <b>meta</b>).');
      $('#st-game-btn').hidden = false;
      $('#st-game-btn').textContent = 'Escolher pasta';
    }
    refresh();
  });
  $('#st-game-btn').addEventListener('click', async () => {
    const r = await hyrule.pickGame();
    if (!r.ok) { if (r.error) mark('game', 'active error', esc(r.error)); return; }
    setGame(r.game, false);
  });
  $('#setup-go').addEventListener('click', async () => {
    $('#setup-go').disabled = true;
    mark('art', 'working', 'Extraindo capa, logo e música do seu jogo…');
    const [r] = await Promise.all([hyrule.finishSetup({ cemuExe, gameDir: game.dir }), wait(900)]);
    if (!r.ok) { mark('art', 'active error', esc(r.error)); refresh(); return; }
    mark('art', 'done', 'Pronto! Hyrule despertou.');
    await wait(650);
    el.classList.remove('show');
    done(true);
  });
  $('#setup-cancel').addEventListener('click', () => { el.classList.remove('show'); done(false); });

  return {
    open(canCancel) {
      cemuExe = null; game = null;
      mark('cemu', 'active', 'Escolha o arquivo <b>Cemu.exe</b> (versão 1.x ou 2.x).');
      mark('game', 'waiting', 'Procuro sozinho nas pastas do Cemu.');
      mark('art', 'waiting', 'Capa, logo e música vêm da <b>sua</b> cópia do jogo.');
      $('#st-cemu-btn').textContent = 'Escolher';
      $('#st-game-btn').hidden = true;
      $('#setup-cancel').hidden = !canCancel;
      refresh();
      el.classList.add('show');
      return new Promise((r) => (done = r));
    },
  };
})();

async function reconfigure() {
  if (!(await setupUI.open(true))) return;
  const d = await hyrule.info();
  await applyArt(d.art);
  render(d);
}

/* ================= Abertura ================= */
(async () => {
  const splash = $('#splash');
  let skip;
  const skipped = new Promise((r) => (skip = r));
  splash.addEventListener('click', () => skip());
  let [data] = await Promise.all([
    hyrule.info(),
    Promise.race([wait(2300), skipped]),
    document.fonts.ready,
  ]);
  if (data.needsSetup) {
    splash.classList.add('out');
    await setupUI.open(false);
    data = await hyrule.info();
  }
  await applyArt(data.art);
  render(data);
  moveInk($('.tab.active'), true);
  splash.classList.add('out');
  app.classList.remove('booting');
  app.classList.add('ready');
  syncMotion();
  setTimeout(() => splash.remove(), 1000);
})();
window.addEventListener('resize', () => moveInk($('.tab.active'), true));
