import { appState } from '../state/appState.js';
import { fetchJsonAsset } from '../data/api.js';
import { fetchCountry } from '../data/reports.js';
import { computeRoundedMetrics } from '../data/scoring.js';
import { getEffectivePeople } from '../data/weights.js';
import { getParentFileForNode, resolveParentReportFile } from '../utils/nodes.js';

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
  if (!Number.isFinite(score) || score <= 0) return palette.muted;
  if (score >= 4.5) return palette.green;
  if (score >= 3.5) return palette.yellow;
  if (score >= 2.5) return palette.orange;
  return palette.red;
}

function formatScore(score) {
  return Number.isFinite(score) ? Number(score).toFixed(1) : '—';
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
  const lookup = new Map();
  const tasks = (appState.countries || []).map(async country => {
    try {
      const enriched = await ensureMetrics(country, mainData, effectivePeople);
      const iso = enriched?.iso;
      const metrics = enriched?.metrics;
      if (!iso) return;
      lookup.set(String(iso).toUpperCase(), {
        name: country.name,
        metrics,
        report: country.file,
      });
    } catch (err) {
      console.warn('Failed to compute country metrics for map', country?.file, err);
    }
  });
  await Promise.allSettled(tasks);
  return lookup;
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

function renderLegend(palette) {
  const legend = document.getElementById('mapLegend');
  if (!legend) return;
  const ranges = [
    { label: '≥ 4.5 (excellent)', color: palette.green },
    { label: '3.5 – 4.4', color: palette.yellow },
    { label: '2.5 – 3.4', color: palette.orange },
    { label: '≤ 2.4', color: palette.red },
    { label: 'No data', color: palette.muted },
  ];
  legend.innerHTML = '';
  ranges.forEach(entry => {
    const item = document.createElement('span');
    item.className = 'map-legend__item';
    const swatch = document.createElement('span');
    swatch.className = 'map-legend__swatch';
    swatch.style.background = entry.color;
    const label = document.createElement('span');
    label.className = 'map-legend__label';
    label.textContent = entry.label;
    item.appendChild(swatch);
    item.appendChild(label);
    legend.appendChild(item);
  });
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

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] || ch));
}

function createCityPopup(city) {
  const score = city?.metrics?.overall;
  const parts = [];
  parts.push(`<strong>${escapeHtml(city.name)}</strong> (${escapeHtml(city.countryName)})`);
  parts.push(`Overall: ${escapeHtml(formatScore(score))}`);
  if (city.report) {
    const safeUrl = escapeHtml(city.report);
    parts.push(`<a href="${safeUrl}" target="_blank" rel="noopener">Open report</a>`);
  }
  return parts.join('<br>');
}

async function initMapView(mainData) {
  if (typeof document === 'undefined') return;
  const mapEl = document.getElementById('mapCanvas');
  if (!mapEl) return;
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
        const iso = extractIso(feature);
        const entry = iso ? countryLookup.get(String(iso).toUpperCase()) : null;
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
        const iso = extractIso(feature);
        const entry = iso ? countryLookup.get(String(iso).toUpperCase()) : null;
        bindFeatureTooltip(layer, feature, entry);
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
    renderLegend(palette);
    setStatus(cityPoints.length === 0 ? 'No cities with coordinates available.' : '');
  } catch (error) {
    console.error('Failed to initialize map view', error);
    setStatus('Unable to render the map right now. Please try again later.');
  }
}

export { initMapView };

export default { initMapView };
