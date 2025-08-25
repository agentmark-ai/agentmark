import TTLCache from "@isaacs/ttlcache";

const cache = new TTLCache({
  max: 10000,
  ttl: 60000,
});

export default cache;
