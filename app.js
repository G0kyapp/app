/**
 * AppDeals — app.js
 *
 * Fuentes de datos:
 * 1. iTunes Search API (precios reales, sin API key)
 * 2. RSS feeds oficiales de Apple (top charts)
 * 3. CORS proxy público para los RSS feeds
 *
 * Para uso en producción reemplazá el proxy por tu propio backend.
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const COUNTRY = 'us';   // Cambiá a 'ar', 'mx', 'es', etc.
const CURRENCY_SYMBOL = '$';
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

// Apps conocidas de pago que a veces se ponen gratis (seeds para buscar)
// Podés ampliar esta lista con IDs de apps que te interesen
const SEED_APP_IDS = [
  // Productividad
  '1035100238', // Bear
  '904280696',  // Things 3
  '1274495053', // Toolbox for Word
  '1352778147', // Creativit
  '1444383602', // GoodLinks
  // Creatividad / Diseño
  '824171161',  // Affinity Photo
  '1274284797', // Darkroom
  '1178074088', // Vectornator
  // Juegos premium
  '1164220678', // Alto's Odyssey
  '1161252508', // Stardew Valley
  '1491944677', // Creaks
  '1446518799', // Disco Elysium
  // Utilidades
  '1477110326', // Lungo
  '1609517630', // Mango 5Star
  '1444321306', // Pockity
  '1055273043', // PDF Expert
  // Salud
  '1355594173', // Calzy
  '1440147399', // Streaks
  // Educación
  '1508979490', // Kolibri
  '1450660201', // Subjects
  // Música
  '1176895641', // Capo
  '431048782',  // GarageBand (free, but useful reference)
  // Finanzas
  '1473126088', // Chronicle
  '1440147399', // Copilot Money
];

// ─── STATE ───────────────────────────────────────────────────────────────────

let allApps = [];
let activeType = 'all';
let activeCat = 'all';

// ─── FETCH ───────────────────────────────────────────────────────────────────

async function fetchItunesById(ids) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));

  const results = [];
  for (const chunk of chunks) {
    const url = `https://itunes.apple.com/lookup?id=${chunk.join(',')}&country=${COUNTRY}`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (d.results) results.push(...d.results);
    } catch (e) {
      console.warn('iTunes lookup error:', e);
    }
  }
  return results;
}

async function fetchTopFreeApps() {
  const feedUrl = `https://rss.applemarketingtools.com/api/v2/${COUNTRY}/apps/top-free/100/apps.json`;
  try {
    const r = await fetch(feedUrl);
    const d = await r.json();
    const ids = d.feed.results.map(a => a.id);
    return ids;
  } catch (e) {
    console.warn('RSS feed error:', e);
    return [];
  }
}

async function fetchTopPaidApps() {
  const feedUrl = `https://rss.applemarketingtools.com/api/v2/${COUNTRY}/apps/top-paid/100/apps.json`;
  try {
    const r = await fetch(feedUrl);
    const d = await r.json();
    const ids = d.feed.results.map(a => a.id);
    return ids;
  } catch (e) {
    console.warn('RSS feed error:', e);
    return [];
  }
}

// ─── CLASSIFY ────────────────────────────────────────────────────────────────

function classifyApp(app) {
  const price = app.price ?? 0;
  const origPrice = app.formattedPrice;
  const hasIAP = app.isGameCenterEnabled || (app.features && app.features.includes('iosUniversal'));

  // Algunas apps reportan "In-App Purchases" en el campo de descripción o en formattedPrice
  const descHasIAP = (app.description || '').toLowerCase().includes('in-app purchase') ||
                     (app.formattedPrice || '').toLowerCase().includes('in-app');

  // Si el precio base es 0 y originalmente era de pago (usamos heurística)
  if (price === 0) {
    return { type: 'free', label: 'GRATIS' };
  }

  // Descuento: no tenemos precio histórico via API pública, pero podemos detectar
  // si el precio es inusualmente bajo para su categoría o si está en el top free
  // habiendo sido pagada (cruce de listas)
  if (descHasIAP || hasIAP) {
    return { type: 'iap', label: 'IAP disponible' };
  }

  return { type: 'paid', label: `${CURRENCY_SYMBOL}${price.toFixed(2)}` };
}

function parseApps(rawApps, topFreeIds = new Set()) {
  return rawApps
    .filter(a => a.kind === 'software' || a.wrapperType === 'software')
    .map(a => {
      const price = a.price ?? 0;
      const wasInTopFree = topFreeIds.has(String(a.trackId));

      let type = 'paid';
      if (price === 0) type = 'free';
      else if (wasInTopFree) type = 'free'; // apareció en top free siendo de pago → bajó
      // heurística de descuento: apps de pago con precio muy bajo para su categoría
      else if (price > 0 && price < 1.99 && a.primaryGenreName !== 'Games') type = 'discount';
      else if (price > 0 && price < 0.99) type = 'discount';

      // Detectar IAP en la descripción
      const desc = (a.description || '').toLowerCase();
      const hasIAP = desc.includes('in-app purchase') || desc.includes('subscription');

      return {
        id: String(a.trackId),
        name: a.trackName,
        dev: a.artistName,
        cat: a.primaryGenreName || 'App',
        icon: a.artworkUrl100 || a.artworkUrl60,
        price: price,
        priceFormatted: price === 0 ? 'GRATIS' : `${CURRENCY_SYMBOL}${price.toFixed(2)}`,
        type,
        hasIAP,
        desc: a.description ? a.description.substring(0, 200) : '',
        storeUrl: a.trackViewUrl,
        rating: a.averageUserRating,
        ratingCount: a.userRatingCount,
      };
    })
    .filter(a => a.type !== 'paid'); // solo mostrar ofertas
}

// ─── FALLBACK DATA ────────────────────────────────────────────────────────────
// Se usa cuando la API falla (desarrollo local, CORS, etc.)

const FALLBACK_APPS = [
  { id:'1',name:'Pockity',dev:'KreativeKode',cat:'Productividad',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:false,desc:'Gestor de tareas con markdown y proyectos. Normalmente $4.99.',storeUrl:'https://apps.apple.com',rating:4.8,ratingCount:1200 },
  { id:'2',name:'Darkroom',dev:'Bergen Co',cat:'Fotografía',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:false,desc:'Editor profesional de fotos RAW. Normalmente $9.99.',storeUrl:'https://apps.apple.com',rating:4.9,ratingCount:8400 },
  { id:'3',name:'Alto\'s Odyssey',dev:'Snowman',cat:'Juegos',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:false,desc:'Premiado juego de aventura. Normalmente $4.99.',storeUrl:'https://apps.apple.com',rating:4.9,ratingCount:22000 },
  { id:'4',name:'Lasso',dev:'Purple Tree',cat:'Utilidades',icon:'',price:1.99,priceFormatted:'$1.99',type:'discount',hasIAP:false,desc:'Gestor de marcadores con iCloud. Normalmente $7.99.',storeUrl:'https://apps.apple.com',rating:4.7,ratingCount:650 },
  { id:'5',name:'Speeko',dev:'Speeko Inc',cat:'Educación',icon:'',price:2.99,priceFormatted:'$2.99',type:'discount',hasIAP:true,desc:'Coach de oratoria con ejercicios diarios.',storeUrl:'https://apps.apple.com',rating:4.6,ratingCount:3100 },
  { id:'6',name:'Keewordz',dev:'AppAgent',cat:'Negocios',icon:'',price:4.99,priceFormatted:'$4.99',type:'discount',hasIAP:false,desc:'Investigación de keywords para el App Store. Normalmente $14.99.',storeUrl:'https://apps.apple.com',rating:4.5,ratingCount:420 },
  { id:'7',name:'Focus Flow',dev:'MindApps',cat:'Salud y forma física',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:true,desc:'Temporizador Pomodoro con música binaural.',storeUrl:'https://apps.apple.com',rating:4.7,ratingCount:5500 },
  { id:'8',name:'Mango 5Star',dev:'Mango',cat:'Negocios',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:false,desc:'Gestión de equipos con OKR y check-ins. Normalmente $19.99.',storeUrl:'https://apps.apple.com',rating:4.4,ratingCount:290 },
  { id:'9',name:'Vectornator',dev:'Linearity',cat:'Diseño y decoración',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:true,desc:'Suite de diseño vectorial. Suscripción para funciones pro.',storeUrl:'https://apps.apple.com',rating:4.8,ratingCount:14200 },
  { id:'10',name:'GoodLinks',dev:'Ngoc Luu',cat:'Productividad',icon:'',price:0,priceFormatted:'GRATIS',type:'iap',hasIAP:true,desc:'Lector y gestor de artículos. IAP para sincronización premium.',storeUrl:'https://apps.apple.com',rating:4.9,ratingCount:1800 },
  { id:'11',name:'Subjects',dev:'Bloop',cat:'Educación',icon:'',price:0,priceFormatted:'GRATIS',type:'free',hasIAP:false,desc:'Organizador académico para estudiantes. Normalmente $5.99.',storeUrl:'https://apps.apple.com',rating:4.6,ratingCount:760 },
  { id:'12',name:'Capo',dev:'SuperMegaUltraGroovy',cat:'Música',icon:'',price:3.99,priceFormatted:'$3.99',type:'discount',hasIAP:false,desc:'Aprende canciones al oído con IA. Normalmente $17.99.',storeUrl:'https://apps.apple.com',rating:4.5,ratingCount:2300 },
];

// ─── LOAD ─────────────────────────────────────────────────────────────────────

async function loadData() {
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('errorState').style.display = 'none';

  let usedFallback = false;

  try {
    // 1. Obtener top free IDs (para detectar apps de pago que bajaron a gratis)
    const [topFreeIds, topPaidIds] = await Promise.all([
      fetchTopFreeApps(),
      fetchTopPaidApps(),
    ]);

    const topFreeSet = new Set(topFreeIds);

    // 2. Combinar IDs: seeds + top paid (estos son los que nos interesa buscar con precio $0)
    const allIds = [...new Set([...SEED_APP_IDS, ...topPaidIds.slice(0, 50), ...topFreeIds.slice(0, 50)])];

    // 3. Lookup de precios reales via iTunes API
    const rawApps = await fetchItunesById(allIds);

    if (!rawApps.length) throw new Error('No data from iTunes API');

    // 4. Parsear y clasificar
    allApps = parseApps(rawApps, topFreeSet);

    if (!allApps.length) {
      // Si no encontramos ofertas, usamos fallback igualmente
      allApps = FALLBACK_APPS;
      usedFallback = true;
    }

  } catch (e) {
    console.error('Fetch failed, using fallback data:', e);
    allApps = FALLBACK_APPS;
    usedFallback = true;
  }

  // 5. Render
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';

  if (usedFallback) {
    document.getElementById('errorState').style.display = 'block';
  }

  buildCategoryFilters();
  updateStats();
  renderAll();

  const now = new Date();
  document.getElementById('lastUpdated').style.display = 'flex';
  document.getElementById('updatedText').textContent =
    `Actualizado a las ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}${usedFallback ? ' (datos de ejemplo)' : ''}`;
}

// ─── FILTERS ─────────────────────────────────────────────────────────────────

function setType(type) {
  activeType = type;
  document.querySelectorAll('.ftype').forEach(b => b.className = 'ftype');
  const map = { all:'active-all', free:'active-free', discount:'active-discount', iap:'active-iap' };
  document.getElementById('ft-' + (type === 'discount' ? 'disc' : type)).classList.add(map[type]);
  renderAll();
}

function setCat(cat, el) {
  activeCat = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderAll();
}

function buildCategoryFilters() {
  const cats = ['all', ...new Set(allApps.map(a => a.cat))].sort();
  const container = document.getElementById('catButtons');
  container.innerHTML = cats.map(c =>
    `<button class="cat-btn${c === 'all' ? ' active' : ''}" onclick="setCat('${c}',this)">
      ${c === 'all' ? 'Todas las categorías' : c}
    </button>`
  ).join('');
}

function getFiltered(type) {
  const q = document.getElementById('searchInput').value.toLowerCase();
  return allApps.filter(a => {
    const typeMatch = type === 'any'
      ? (activeType === 'all' || a.type === activeType)
      : a.type === type;
    const catMatch = activeCat === 'all' || a.cat === activeCat;
    const searchMatch = !q || a.name.toLowerCase().includes(q) || a.dev.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q);
    return typeMatch && catMatch && searchMatch;
  });
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function updateStats() {
  const free = allApps.filter(a => a.type === 'free').length;
  const disc = allApps.filter(a => a.type === 'discount').length;
  const iap  = allApps.filter(a => a.type === 'iap').length;
  document.getElementById('statFree').textContent = free;
  document.getElementById('statDisc').textContent = disc;
  document.getElementById('statIap').textContent = iap;
}

function cardHTML(a) {
  const iconHtml = a.icon
    ? `<img class="app-icon" src="${a.icon}" alt="${a.name}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=\\'app-icon-placeholder\\'>📱</div>'">`
    : `<div class="app-icon-placeholder">📱</div>`;

  const badgeMap = { free:'badge-free', discount:'badge-discount', iap:'badge-iap' };
  const labelMap = { free:'GRATIS', discount:'OFERTA', iap:'IAP gratis' };

  const iapBadge = a.hasIAP && a.type !== 'iap'
    ? `<span class="iap-note">+ IAP</span>` : '';

  const stars = a.rating ? `⭐ ${a.rating.toFixed(1)}` : '';

  return `
  <a class="app-card" href="${a.storeUrl}" target="_blank" rel="noopener">
    <span class="store-btn">Ver en App Store ↗</span>
    <div class="app-icon-wrap">
      ${iconHtml}
      <span class="badge-type ${badgeMap[a.type]}">${labelMap[a.type]}</span>
    </div>
    <div class="app-info">
      <div class="app-name">${a.name}</div>
      <div class="app-dev">${a.dev}</div>
      <div class="app-tags">
        <span class="tag">${a.cat}</span>
        ${stars ? `<span class="tag">${stars}</span>` : ''}
      </div>
      <div class="app-price-row">
        <span class="price-now ${a.type === 'free' ? 'free' : 'discount'}">${a.priceFormatted}</span>
        ${iapBadge}
      </div>
      ${a.desc ? `<div class="app-desc">${a.desc}</div>` : ''}
    </div>
  </a>`;
}

function renderSection(gridId, sectionId, countId, apps) {
  const grid = document.getElementById(gridId);
  const section = document.getElementById(sectionId);
  const countEl = document.getElementById(countId);

  if (!apps.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  countEl.textContent = `${apps.length} app${apps.length !== 1 ? 's' : ''}`;
  grid.innerHTML = apps.map(cardHTML).join('');
}

function renderAll() {
  const showAll = activeType === 'all';

  const freeApps     = showAll ? getFiltered('free')     : (activeType === 'free'     ? getFiltered('any') : []);
  const discountApps = showAll ? getFiltered('discount') : (activeType === 'discount' ? getFiltered('any') : []);
  const iapApps      = showAll ? getFiltered('iap')      : (activeType === 'iap'      ? getFiltered('any') : []);

  renderSection('freeGrid',     'freeSection', 'freeSectionCount', freeApps);
  renderSection('discGrid',     'discSection', 'discSectionCount', discountApps);
  renderSection('iapGrid',      'iapSection',  'iapSectionCount',  iapApps);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

loadData();
