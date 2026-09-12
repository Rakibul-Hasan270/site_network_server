/* ============================================================================
   Mirrors the bucket/filter logic from the React clone's mockFetch(), but
   builds a MongoDB query object instead of filtering an in-memory array.
============================================================================ */

function parseUnit(str) {
  str = String(str).trim();
  if (/M$/i.test(str)) return parseFloat(str) * 1_000_000;
  if (/K$/i.test(str)) return parseFloat(str) * 1_000;
  return parseFloat(str);
}

// "31 to 40" -> [31, 40] | "500k to 1M" -> [500000, 1000000] | "250+" -> [250, Infinity]
function bucketToRange(bucket) {
  if (!bucket) return null;
  if (bucket.endsWith('+')) {
    return [parseUnit(bucket.slice(0, -1)), Infinity];
  }
  const [a, b] = bucket.split(' to ');
  return [parseUnit(a), parseUnit(b)];
}

// filter key -> the document field it constrains, for keys that are numeric buckets
const NUMERIC_BUCKET_FIELDS = {
  as: 'as',
  da: 'da',
  dr: 'dr',
  ahrefsTraffic: 'ahrefsTraffic',
  ahrefsKeywords: 'ahrefsKeywords',
  semrushTraffic: 'semrushTraffic',
  priceRange: 'price',
};

function buildMongoFilter(search, filters) {
  const query = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.domain = { $regex: escaped, $options: 'i' };
  }

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;

    if (NUMERIC_BUCKET_FIELDS[key]) {
      const range = bucketToRange(value);
      if (!range) return;
      const [min, max] = range;
      query[NUMERIC_BUCKET_FIELDS[key]] = {
        $gte: min,
        ...(max !== Infinity ? { $lte: max } : {}),
      };
      return;
    }

    switch (key) {
      case 'country':
        query['countries.name'] = value;
        break;
      case 'niche':
        query.niches = value; // Mongo matches if value is inside the array
        break;
      case 'backlinksCount':
        query.backlinksCount = Number(value);
        break;
      case 'linkType':
        query.dofollow = value === 'DoFollow';
        break;
      case 'linkValidity':
        query.linkValidity = value;
        break;
      case 'language':
        query.language = value;
        break;
      case 'sportsGaming':
        query.sportsGaming = value === 'Yes';
        break;
      case 'pharmacy':
        query.pharmacy = value === 'Yes';
        break;
      case 'googleNews':
        query.googleNews = value === 'Yes';
        break;
      case 'foreignLang':
        query.foreignLang = value === 'Yes';
        break;
      case 'selectNew':
        if (value === 'Only New') {
          query.isNew = true;
        } else if (value === 'Exclude New') {
          query.isNew = { $ne: true };
        }
        break;
      default:
        break; // unknown filter key, ignore rather than throw
    }
  });

  return query;
}

const SORTERS = {
  default: { addedAt: -1 },
  da_desc: { da: -1 },
  dr_desc: { dr: -1 },
  traffic_desc: { ahrefsTraffic: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
};

function buildSort(sortBy) {
  return SORTERS[sortBy] || SORTERS.default;
}

module.exports = { buildMongoFilter, buildSort, bucketToRange, parseUnit };