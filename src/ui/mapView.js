import { appState } from '../state/appState.js';
import { fetchJsonAsset } from '../data/api.js';
import { fetchCountry } from '../data/reports.js';
import { computeRoundedMetrics } from '../data/scoring.js';
import { getEffectivePeople } from '../data/weights.js';
import { getParentFileForNode, resolveParentReportFile, findNodeByFile } from '../utils/nodes.js';
import { getScoreBucket, makeScoreChip } from './components/chips.js';
import { createFlagImg } from '../utils/dom.js';
import { activateReportSelection } from './funnelView.js';

const MAP_VIEW_STORAGE_KEY = 'mapViewExtent';
const MAP_DEFAULT_CENTER = [24, 0];
const MAP_DEFAULT_ZOOM = 2;
const MAP_MIN_ZOOM = 2;
const MAP_MAX_ZOOM = 6;
const MAP_FILTER_STORAGE_KEY = 'mapApplyFunnelFilter';

let leafletPromise = null;
let worldGeoPromise = null;
let mapInstance = null;
let countryLayer = null;
let cityLayer = null;
let lastMainData = null;
let cityCoordLookupPromise = null;
let mapApplyFunnelFilter = loadMapFilterPreference();
let funnelFilterListenerAttached = false;
let focusChangeListenerAttached = false;

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

function clampZoom(zoom) {
  return Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, Number(zoom)));
}

function loadMapFilterPreference() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = window.localStorage.getItem(MAP_FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) === true : false;
  } catch {
    return false;
  }
}

function persistMapFilterPreference(enabled) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MAP_FILTER_STORAGE_KEY, JSON.stringify(!!enabled));
  } catch {}
}

function loadSavedExtent() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const lat = Number(parsed?.center?.[0]);
    const lng = Number(parsed?.center?.[1]);
    const zoom = clampZoom(parsed?.zoom);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom)) {
      return { center: [lat, lng], zoom };
    }
  } catch (err) {
    console.warn('Failed to parse saved map extent', err);
  }
  return null;
}

function persistMapExtent(map) {
  if (!map || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const center = map.getCenter();
    const zoom = clampZoom(map.getZoom());
    const payload = {
      center: [Number(center.lat), Number(center.lng)],
      zoom,
    };
    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to persist map extent', err);
  }
}

function attachExtentPersistence(map) {
  if (!map || map.__extentPersistenceAttached) return;
  const handler = () => persistMapExtent(map);
  map.on('moveend', handler);
  map.on('zoomend', handler);
  map.__extentPersistenceAttached = true;
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
  if (data) {
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      node.latitude = node.latitude ?? lat;
      node.longitude = node.longitude ?? lng;
    }
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

async function buildCityPoints(mainData, effectivePeople, allowedSet = null) {
  const points = [];
  const countryList = Array.isArray(appState.countries) ? appState.countries : [];
  const tasks = [];
  if (!cityCoordLookupPromise) {
    cityCoordLookupPromise = (async () => {
      try {
        const raw = await fetchJsonAsset('data/cities.json');
        const map = new Map();
        const list = Array.isArray(raw?.cities) ? raw.cities : [];
        list.forEach(c => {
          const lat = Number(c?.lat);
          const lng = Number(c?.lng);
          if (c?.id && Number.isFinite(lat) && Number.isFinite(lng)) {
            map.set(c.id, { lat, lng });
          }
        });
        return map;
      } catch (err) {
        console.warn('Failed to load cities.json for coordinates', err);
        return new Map();
      }
    })();
  }
  const cityCoordLookup = await cityCoordLookupPromise;
  countryList.forEach(country => {
    (country.cities || []).forEach(city => {
      tasks.push((async () => {
        try {
          if (allowedSet && !allowedSet.has(city)) {
            return;
          }
          const cityCoords = cityCoordLookup.get(city.id);
          const cityLat = Number(city.lat ?? city.latitude ?? cityCoords?.lat);
          const cityLng = Number(city.lng ?? city.longitude ?? cityCoords?.lng);
          const enriched = await ensureMetrics(city, mainData, effectivePeople);
          if (!enriched) return;
          const lat = Number.isFinite(cityLat) ? cityLat : Number(enriched.latitude ?? enriched.lat);
          const lng = Number.isFinite(cityLng) ? cityLng : Number(enriched.longitude ?? enriched.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            console.warn('City missing coordinates', city?.file || city?.id);
            return;
          }
          points.push({
            name: city.name,
            countryName: country.name,
            iso: enriched.iso,
            metrics: enriched.metrics,
            lat,
            lng,
            report: city.file,
            node: city,
          });
        } catch (err) {
          console.warn('Failed to build city point', city?.file, err);
        }
      })());
    });
  });
  await Promise.allSettled(tasks);
  if (points.length === 0) {
    console.warn('No city points built; check city report fetch/coordinates.');
  }
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
  if (normalizedSet.size === 0) {
    return { names: [], hasFocus: false };
  }

  const categories = Array.isArray(mainData?.Categories) ? mainData.Categories : [];
  const names = [];
  categories.forEach(cat => {
    const rawName = typeof cat?.Category === 'string' ? cat.Category.trim() : '';
    const normalizedName = normalizeCategoryName(rawName);
    if (!normalizedName || !normalizedSet.has(normalizedName)) return;
    if (!names.some(existing => normalizeCategoryName(existing) === normalizedName)) {
      names.push(rawName || cat?.Category || '');
    }
  });
  return { names, hasFocus: names.length > 0 };
}

function updateFocusBadge(mainData) {
  const badge = document.getElementById('mapFocusBadge');
  const categoriesEl = document.getElementById('mapFocusCategories');
  if (!badge || !categoriesEl) return;
  const dataSource = mainData || appState.mainData || lastMainData;
  const { names, hasFocus } = getActiveFocusCategories(dataSource);
  if (!hasFocus) {
    badge.hidden = true;
    badge.setAttribute('hidden', '');
    categoriesEl.textContent = '';
    return;
  }
  badge.hidden = false;
  badge.removeAttribute('hidden');
  categoriesEl.textContent = names.join(', ');
}

function getTotalCityCount() {
  if (!Array.isArray(appState.countries)) return 0;
  return appState.countries.reduce((total, country) => {
    const cityCount = Array.isArray(country?.cities) ? country.cities.length : 0;
    return total + cityCount;
  }, 0);
}

function getFunnelIncludedCities() {
  return Array.isArray(appState.funnelIncludedCities) ? appState.funnelIncludedCities : [];
}

function getCityFilterSet() {
  if (!mapApplyFunnelFilter) return null;
  if (!appState.hasActiveFunnelFilters) return null;
  return new Set(getFunnelIncludedCities());
}

function updateMapFilterBadge() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('mapFilterBadge');
  const toggle = document.getElementById('mapFilterToggle');
  const status = document.getElementById('mapFilterStatus');
  if (!badge || !toggle || !status) return;
  toggle.checked = mapApplyFunnelFilter;
  appState.mapApplyFunnelFilter = mapApplyFunnelFilter;
  const totalCities = getTotalCityCount();
  const hasFilters = !!appState.hasActiveFunnelFilters;
  const includedCount = hasFilters ? getFunnelIncludedCities().length : totalCities;
  const applyingFilter = hasFilters && mapApplyFunnelFilter;

  if (!hasFilters) {
    status.textContent = totalCities === 0
      ? 'Add reports to plot cities.'
      : `No funnel filters set. Showing all ${totalCities} cities.`;
  } else if (applyingFilter) {
    status.textContent = includedCount === 0
      ? 'Funnel filter on. No cities match.'
      : `Funnel filter on - showing ${includedCount} of ${totalCities} cities.`;
  } else {
    status.textContent = `Funnel filter ready. Showing all ${totalCities} cities.`;
  }
}

function attachMapFilterToggle() {
  if (typeof document === 'undefined') return;
  const toggle = document.getElementById('mapFilterToggle');
  if (!toggle || toggle.dataset.__mapFilterHandlerAttached) return;
  toggle.dataset.__mapFilterHandlerAttached = 'true';
  toggle.addEventListener('change', () => {
    mapApplyFunnelFilter = !!toggle.checked;
    appState.mapApplyFunnelFilter = mapApplyFunnelFilter;
    persistMapFilterPreference(mapApplyFunnelFilter);
    updateMapFilterBadge();
    void initMapView(lastMainData);
  });
}

function attachFunnelFilterListener() {
  if (funnelFilterListenerAttached || typeof document === 'undefined') return;
  const handler = () => {
    updateMapFilterBadge();
    if (mapApplyFunnelFilter) {
      void initMapView(lastMainData);
    }
  };
  document.addEventListener('funnelFiltersUpdated', handler);
  funnelFilterListenerAttached = true;
}

function attachFocusChangeListener() {
  if (focusChangeListenerAttached || typeof document === 'undefined') return;
  const handler = () => updateFocusBadge(lastMainData);
  document.addEventListener('categoryFocusChanged', handler);
  focusChangeListenerAttached = true;
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
    updateFocusBadge(lastMainData);
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
  lastMainData = mainData || lastMainData;
  appState.mapApplyFunnelFilter = mapApplyFunnelFilter;
  attachFunnelFilterListener();
  attachFocusChangeListener();
  attachMapFilterToggle();
  updateFocusBadge(mainData);
  updateMapFilterBadge();
  const cityFilterSet = getCityFilterSet();
  const applyingFunnelFilter = !!cityFilterSet;
  const savedExtent = loadSavedExtent();
  try {
    setStatus('Building map...');
    const [L, worldGeo] = await Promise.all([loadLeaflet(), loadWorldGeo()]);
    const effectivePeople = getEffectivePeople(mainData);
    const [countryLookup, cityPoints] = await Promise.all([
      buildCountryLookup(mainData, effectivePeople),
      buildCityPoints(mainData, effectivePeople, cityFilterSet),
    ]);
    const palette = getPalette();

    if (!mapInstance) {
      mapInstance = L.map(mapEl, {
        worldCopyJump: true,
        preferCanvas: true,
        minZoom: MAP_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
      });
      if (savedExtent) {
        mapInstance.setView(savedExtent.center, savedExtent.zoom);
      } else {
        mapInstance.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM);
      }
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: MAP_MAX_ZOOM,
        minZoom: MAP_MIN_ZOOM,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapInstance);
      attachMapTabHandler(L);
      attachExtentPersistence(mapInstance);
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
      if (!savedExtent) {
        mapInstance.fitBounds(countryLayer.getBounds(), { padding: [12, 12] });
      }
    }
    if (mapInstance) persistMapExtent(mapInstance);
    const statusMessage = cityPoints.length === 0
      ? (applyingFunnelFilter && appState.hasActiveFunnelFilters
        ? 'No cities match the current funnel filters.'
        : 'No cities with coordinates available.')
      : '';
    setStatus(statusMessage);
  } catch (error) {
    console.error('Failed to initialize map view', error);
    setStatus('Unable to render the map right now. Please try again later.');
  }
}

export { initMapView };

export default { initMapView };
