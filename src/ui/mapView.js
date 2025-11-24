import { appState } from '../state/appState.js';
import { fetchJsonAsset } from '../data/api.js';
import { fetchCountry } from '../data/reports.js';
import { computeRoundedMetrics } from '../data/scoring.js';
import { getEffectivePeople } from '../data/weights.js';
import { getParentFileForNode, resolveParentReportFile, findNodeByFile } from '../utils/nodes.js';
import { getScoreBucket, makeScoreChip } from './components/chips.js';
import { createFlagImg } from '../utils/dom.js';
import { activateReportSelection } from './funnelView.js';

let leafletPromise = null;
let worldGeoPromise = null;
let mapInstance = null;
let countryLayer = null;
let cityLayer = null;

function getCssColor(varName, fallback) {
  if (typeof window === 'undefined') return fallback;
  const styles = getComputedStyle(document.documentElement);
  const value = styles.getPropertyValue(varName);
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function getPalette() {
  return {
    red: getCssColor('--score-red', '#d32f2f'),
    orange: getCssColor('--score-orange', '#f57c00'),
    yellow: getCssColor('--score-yellow', '#ffc107'),
    green: getCssColor('--score-green', '#388e3c'),
    muted: getCssColor('--score-muted', '#87CEEB'),
  };
}

function scoreToColor(score, palette) {
  const bucket = getScoreBucket(score);
  const key = bucket?.key;
  if (key === 'red') return palette.red;
  if (key === 'orange') return palette.orange;
  if (key === 'yellow') return palette.yellow;
  if (key === 'green') return palette.green;
  return palette.muted;
}

function formatScore(score) {
  return Number.isFinite(score) ? Number(score).toFixed(1) : '—';
}

function normalizeCategoryName(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = import('https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js')
      .then(mod => mod?.default || mod)
      .catch(err => {
        console.error('Failed to load Leaflet', err);
        throw err;
      });
  }
  return leafletPromise;
}

async function loadWorldGeo() {
  if (!worldGeoPromise) {
    worldGeoPromise = fetchJsonAsset('data/world-simple.geojson');
  }
  return worldGeoPromise;
}

function handleOpenReport(reportFile, node) {
  const targetNode = node || (reportFile ? findNodeByFile(reportFile) : null);
  if (targetNode) {
    activateReportSelection(targetNode);
    return;
  }
  if (reportFile && typeof window !== 'undefined') {
    window.open(reportFile, '_blank', 'noopener');
  }
}

async function ensureMetrics(node, mainData, effectivePeople) {
  if (!node) return null;
  if (node.metrics && node.iso) {
    return node;
  }
  const data = await fetchCountry(node.file, {
    parentFile: getParentFileForNode(node),
    resolveParentFile: resolveParentReportFile,
  });
  if (data && data.iso && !node.iso) node.iso = String(data.iso);
  if (!node.metrics) {
    node.metrics = computeRoundedMetrics(data, mainData, effectivePeople);
  }
  return node;
}

async function buildCountryLookup(mainData, effectivePeople) {
  const isoMap = new Map();
  const nameMap = new Map();
  const tasks = (appState.countries || []).map(async country => {
    try {
      const enriched = await ensureMetrics(country, mainData, effectivePeople);
      const iso = enriched?.iso;
      const metrics = enriched?.metrics;
      if (!iso) return;
      const entry = {
        name: country.name,
        metrics,
        report: country.file,
        iso,
        node: country,
      };
      isoMap.set(String(iso).toUpperCase(), entry);
      const nameKey = (country.name || '').trim().toLowerCase();
      if (nameKey && !nameMap.has(nameKey)) {
        nameMap.set(nameKey, entry);
      }
    } catch (err) {
      console.warn('Failed to compute country metrics for map', country?.file, err);
    }
  });
  await Promise.allSettled(tasks);
  return { isoMap, nameMap };
}

async function loadCityCoordinates() {
  try {
    const raw = await fetchJsonAsset('data/city_locations.json');
    const coords = Array.isArray(raw?.cities) ? raw.cities : [];
    const map = new Map();
    coords.forEach(entry => {
      if (!entry || !entry.id) return;
      if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) return;
      map.set(entry.id, { lat: entry.lat, lng: entry.lng });
    });
    return map;
  } catch (err) {
    console.warn('Failed to load city coordinate data', err);
    return new Map();
  }
}

async function buildCityPoints(mainData, effectivePeople) {
  const coords = await loadCityCoordinates();
  const points = [];
  const countryList = Array.isArray(appState.countries) ? appState.countries : [];
  const tasks = [];
  countryList.forEach(country => {
    (country.cities || []).forEach(city => {
      tasks.push((async () => {
        const coord = city.id ? coords.get(city.id) : null;
        if (!coord) return;
        const enriched = await ensureMetrics(city, mainData, effectivePeople);
        if (!enriched) return;
        points.push({
          name: city.name,
          countryName: country.name,
          iso: enriched.iso,
          metrics: enriched.metrics,
          lat: coord.lat,
          lng: coord.lng,
          report: city.file,
          node: city,
        });
      })());
    });
  });
  await Promise.allSettled(tasks);
  return points;
}

function extractIso(feature) {
  const props = feature?.properties;
  if (!props) return null;
  const keys = ['ISO3166-1-Alpha-2', 'ISO_A2', 'iso_a2', 'ISO_A2_EH'];
  for (const key of keys) {
    if (props[key]) return String(props[key]);
  }
  return null;
}

function setStatus(message) {
  const status = document.getElementById('mapStatus');
  if (!status) return;
  if (!message) {
    status.hidden = true;
    status.textContent = '';
    return;
  }
  status.hidden = false;
  status.textContent = message;
}

function createReportLink(reportFile, text = 'Open report', node) {
  if (!reportFile && !node) return null;
  const link = document.createElement('a');
  link.href = reportFile || '#';
  link.setAttribute('role', 'button');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    handleOpenReport(reportFile, node);
  });
  link.className = 'map-city-popup__link';
  link.textContent = text;
  return link;
}

function getActiveFocusCategories(mainData) {
  const focusList = Array.isArray(appState.focusedCategories)
    ? appState.focusedCategories.map(name => (typeof name === 'string' ? name.trim() : '')).filter(Boolean)
    : [];
  const normalizedFocus = focusList.map(name => normalizeCategoryName(name)).filter(Boolean);
  const normalizedSet = new Set(normalizedFocus);
  if (normalizedSet.size === 0) return [];

  const categories = Array.isArray(mainData?.Categories) ? mainData.Categories : [];
  const active = [];
  categories.forEach(cat => {
    const rawName = typeof cat?.Category === 'string' ? cat.Category.trim() : '';
    const normalizedName = normalizeCategoryName(rawName);
    if (!normalizedName || !normalizedSet.has(normalizedName)) return;
    if (!active.some(existing => normalizeCategoryName(existing) === normalizedName)) {
      active.push(rawName || cat?.Category || '');
    }
  });
  return active;
}

function updateFocusBadge(mainData) {
  const badge = document.getElementById('mapFocusBadge');
  const categoriesEl = document.getElementById('mapFocusCategories');
  if (!badge || !categoriesEl) return;
  const active = getActiveFocusCategories(mainData);
  if (active.length === 0) {
    badge.hidden = true;
    categoriesEl.textContent = '';
    return;
  }
  badge.hidden = false;
  categoriesEl.textContent = active.join(', ');
}

function bindFeatureTooltip(layer, feature, scoreEntry) {
  if (!layer) return;
  const name = feature?.properties?.name || scoreEntry?.name || 'Unknown';
  const score = scoreEntry?.metrics?.overall;
  const text = Number.isFinite(score) ? `${name} – ${formatScore(score)}` : `${name} – no report`;
  layer.bindTooltip(text, { sticky: true, opacity: 0.9 });
}

function attachMapTabHandler(L) {
  const tab = document.getElementById('mapTab');
  if (!tab || !L || !mapInstance) return;
  if (tab.dataset.__mapHandlerAttached) return;
  tab.dataset.__mapHandlerAttached = 'true';
  tab.addEventListener('click', () => {
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch {}
    }, 60);
  });
}

function createCityPopup(city) {
  const wrapper = document.createElement('div');
  wrapper.className = 'map-city-popup country-item city-item';
  const chip = makeScoreChip(Number.isFinite(city?.metrics?.overall) ? city.metrics.overall : null, {
    labelPrefix: 'Alignment score',
  });
  if (chip) wrapper.appendChild(chip);
  const flag = createFlagImg(city?.iso, 18, city?.countryName || city?.name);
  if (flag) wrapper.appendChild(flag);
  const textWrap = document.createElement('div');
  textWrap.className = 'map-city-popup__text';
  const nameEl = document.createElement('div');
  nameEl.className = 'map-city-popup__name';
  nameEl.textContent = city?.name || 'City';
  const countryEl = document.createElement('div');
  countryEl.className = 'map-city-popup__country';
  countryEl.textContent = city?.countryName || '';
  textWrap.appendChild(nameEl);
  textWrap.appendChild(countryEl);
  wrapper.appendChild(textWrap);
  if (city?.report) {
    const link = createReportLink(city.report, 'Open report', city.node);
    if (link) wrapper.appendChild(link);
  }
  return wrapper;
}

function createCountryPopup(feature, entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'map-city-popup country-item';
  const score = Number.isFinite(entry?.metrics?.overall) ? entry.metrics.overall : null;
  const chip = makeScoreChip(score, { labelPrefix: 'Alignment score' });
  if (chip) wrapper.appendChild(chip);
  const iso = entry?.iso || extractIso(feature);
  const flag = createFlagImg(iso, 18, entry?.name || feature?.properties?.name);
  if (flag) wrapper.appendChild(flag);

  const textWrap = document.createElement('div');
  textWrap.className = 'map-city-popup__text';
  const nameEl = document.createElement('div');
  nameEl.className = 'map-city-popup__name';
  nameEl.textContent = entry?.name || feature?.properties?.name || 'Country';
  textWrap.appendChild(nameEl);
  wrapper.appendChild(textWrap);

  if (entry?.report || entry?.node) {
    const link = createReportLink(entry?.report, 'Open report', entry?.node);
    if (link) wrapper.appendChild(link);
  }

  return wrapper;
}

function getFeatureEntry(feature, countryLookup) {
  const iso = extractIso(feature);
  if (iso) {
    const entry = countryLookup.isoMap.get(String(iso).toUpperCase());
    if (entry) return entry;
  }
  const nameKey = (feature?.properties?.name || '').trim().toLowerCase();
  if (nameKey && countryLookup.nameMap.has(nameKey)) {
    return countryLookup.nameMap.get(nameKey);
  }
  return null;
}

async function initMapView(mainData) {
  if (typeof document === 'undefined') return;
  const mapEl = document.getElementById('mapCanvas');
  if (!mapEl) return;
  updateFocusBadge(mainData);
  try {
    setStatus('Building map…');
    const [L, worldGeo] = await Promise.all([loadLeaflet(), loadWorldGeo()]);
    const effectivePeople = getEffectivePeople(mainData);
    const [countryLookup, cityPoints] = await Promise.all([
      buildCountryLookup(mainData, effectivePeople),
      buildCityPoints(mainData, effectivePeople),
    ]);
    const palette = getPalette();

    if (!mapInstance) {
      mapInstance = L.map(mapEl, { worldCopyJump: true, preferCanvas: true });
      mapInstance.setView([24, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 6,
        minZoom: 2,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapInstance);
      attachMapTabHandler(L);
    }

    if (countryLayer) countryLayer.remove();
    countryLayer = L.geoJSON(worldGeo, {
      style: feature => {
        const entry = getFeatureEntry(feature, countryLookup);
        const color = scoreToColor(entry?.metrics?.overall, palette);
        const hasScore = Number.isFinite(entry?.metrics?.overall);
        return {
          color: '#475569',
          weight: 0.6,
          fillColor: color,
          fillOpacity: hasScore ? 0.75 : 0.28,
          opacity: 0.7,
        };
      },
      onEachFeature: (feature, layer) => {
        const entry = getFeatureEntry(feature, countryLookup);
        bindFeatureTooltip(layer, feature, entry);
        layer.on('click', (event) => {
          if (!mapInstance) return;
          const popupContent = createCountryPopup(feature, entry);
          if (!popupContent) return;
          const popup = L.popup({ autoPan: true, closeButton: true });
          popup.setLatLng(event.latlng);
          popup.setContent(popupContent);
          popup.openOn(mapInstance);
        });
      },
    }).addTo(mapInstance);

    if (cityLayer) cityLayer.remove();
    cityLayer = L.layerGroup();
    cityPoints.forEach(city => {
      if (!Number.isFinite(city.lat) || !Number.isFinite(city.lng)) return;
      const color = scoreToColor(city?.metrics?.overall, palette);
      const marker = L.circleMarker([city.lat, city.lng], {
        radius: 6,
        fillColor: color,
        color: '#0f172a',
        weight: 0.8,
        fillOpacity: 0.9,
        opacity: 0.8,
      });
      marker.bindPopup(createCityPopup(city));
      marker.bindTooltip(`${city.name} – ${formatScore(city?.metrics?.overall)}`, { sticky: true, opacity: 0.9 });
      marker.addTo(cityLayer);
    });
    cityLayer.addTo(mapInstance);

    if (countryLayer && countryLayer.getBounds().isValid()) {
      mapInstance.fitBounds(countryLayer.getBounds(), { padding: [12, 12] });
    }
    setStatus(cityPoints.length === 0 ? 'No cities with coordinates available.' : '');
  } catch (error) {
    console.error('Failed to initialize map view', error);
    setStatus('Unable to render the map right now. Please try again later.');
  }
}

export { initMapView };

export default { initMapView };
