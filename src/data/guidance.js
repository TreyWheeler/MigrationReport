function coerceInformationalFlag(value) {
  if (typeof value === 'string') {
    const norm = value.trim().toLowerCase();
    return norm === 'true' || norm === 'yes' || norm === '1';
  }
  return value === true;
}

function normalizeInformationalFlags(mainData) {
  if (!mainData || !Array.isArray(mainData.Categories)) return;
  mainData.Categories.forEach(category => {
    if (!category || !Array.isArray(category.Keys)) return;
    category.Keys.forEach(keyObj => {
      if (!keyObj || typeof keyObj !== 'object') return;
      const raw = (typeof keyObj.Informational !== 'undefined') ? keyObj.Informational : keyObj.informational;
      keyObj.Informational = coerceInformationalFlag(raw);
    });
  });
}

function normalizeRatingGuideList(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const normalized = arr
    .map(entry => {
      const rating = Number(entry?.rating);
      const guidance = typeof entry?.guidance === 'string' ? entry.guidance.trim() : '';
      return { rating: isFinite(rating) ? rating : NaN, guidance };
    })
    .filter(entry => isFinite(entry.rating) && entry.guidance.length > 0);
  normalized.sort((a, b) => {
    if (a.rating !== b.rating) return b.rating - a.rating;
    return a.guidance.localeCompare(b.guidance, undefined, { sensitivity: 'base' });
  });
  return normalized;
}

function makeKeyGuidanceIndex(mainData, ratingGuides = []) {
  const ratingIndex = new Map();
  if (Array.isArray(ratingGuides)) {
    ratingGuides.forEach(entry => {
      if (!entry || typeof entry.key !== 'string') return;
      const keyName = entry.key;
      ratingIndex.set(keyName, {
        key: keyName,
        ratingGuide: normalizeRatingGuideList(entry.ratingGuide),
        considerations: typeof entry.considerations === 'string' ? entry.considerations.trim() : '',
      });
    });
  }

  const map = new Map();
  const categories = Array.isArray(mainData?.Categories) ? mainData.Categories : [];
  let hasRatings = false;
  categories.forEach(category => {
    if (!category || !Array.isArray(category.Keys)) return;
    category.Keys.forEach(keyObj => {
      if (!keyObj || typeof keyObj !== 'object') return;
      const keyName = typeof keyObj.Key === 'string' ? keyObj.Key : '';
      if (typeof keyObj.Guidance !== 'string' && typeof keyObj.guidance === 'string') {
        keyObj.Guidance = keyObj.guidance;
      }
      const ratingEntry = keyName ? ratingIndex.get(keyName) : undefined;
      const ratingGuide = ratingEntry ? ratingEntry.ratingGuide : normalizeRatingGuideList(keyObj.RatingGuide);
      const considerations = ratingEntry && ratingEntry.considerations
        ? ratingEntry.considerations
        : (typeof keyObj.RatingConsiderations === 'string' ? keyObj.RatingConsiderations : '');
      keyObj.RatingGuide = ratingGuide;
      if (considerations) {
        keyObj.RatingConsiderations = considerations;
      } else {
        delete keyObj.RatingConsiderations;
      }
      if (Array.isArray(ratingGuide) && ratingGuide.length > 0) {
        hasRatings = true;
      }
      const record = {
        key: keyName,
        guidance: typeof keyObj.Guidance === 'string' ? keyObj.Guidance.trim() : '',
        ratingGuide,
        considerations,
      };
      if (keyName) {
        map.set(keyName, record);
      }
    });
  });

  ratingIndex.forEach((value, key) => {
    if (!map.has(key)) {
      if (Array.isArray(value.ratingGuide) && value.ratingGuide.length > 0) {
        hasRatings = true;
      }
      map.set(key, {
        key,
        guidance: '',
        ratingGuide: value.ratingGuide,
        considerations: value.considerations,
      });
    }
  });

  return { index: map, hasRatings };
}

async function ensureKeyGuidanceLoaded(mainData, options = {}) {
  const { currentIndex, hasRatings = false, fetchGuides } = options;
  let index = currentIndex instanceof Map ? currentIndex : null;
  let ratingsLoaded = !!hasRatings;

  if (!index || index.size === 0) {
    const base = makeKeyGuidanceIndex(mainData);
    index = base.index;
    ratingsLoaded = ratingsLoaded || base.hasRatings;
  }

  if (ratingsLoaded) {
    return { index, hasRatings: ratingsLoaded };
  }

  const fetchGuidesFn = typeof fetchGuides === 'function'
    ? fetchGuides
    : async () => {
        const response = await fetch('data/rating_guides.json');
        if (!response.ok) {
          throw new Error(`Failed to load rating guides: ${response.status} ${response.statusText}`);
        }
        return response.json();
      };

  try {
    const guidesResponse = await fetchGuidesFn();
    const guides = Array.isArray(guidesResponse?.ratingGuides) ? guidesResponse.ratingGuides : [];
    if (guides.length > 0) {
      const enriched = makeKeyGuidanceIndex(mainData, guides);
      index = enriched.index;
      ratingsLoaded = enriched.hasRatings || ratingsLoaded;
    }
  } catch (err) {
    console.warn('Failed to load rating guides', err);
  }

  return { index, hasRatings: ratingsLoaded };
}

export {
  coerceInformationalFlag,
  normalizeInformationalFlags,
  makeKeyGuidanceIndex,
  ensureKeyGuidanceLoaded,
};
