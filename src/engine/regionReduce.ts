import { MAX_REGION_LENGTH, TR_BOUNDS, TR_PROVINCES, type RegionPoint } from '../data/regions';

/**
 * Reduce a coordinate to a coarse region name. Pure and synchronous on purpose:
 * the coordinates are arguments, the return value is a name, and nothing in
 * between touches the network or any store. The caller is expected to drop the
 * coordinates the moment this returns.
 */

/** Equirectangular approximation — plenty at province scale, and cheap. */
function roughDistance(aLat: number, aLon: number, b: RegionPoint): number {
  const meanLat = ((aLat + b.lat) / 2) * (Math.PI / 180);
  const dLat = aLat - b.lat;
  const dLon = (aLon - b.lon) * Math.cos(meanLat);
  return dLat * dLat + dLon * dLon;
}

export function insideTurkiye(lat: number, lon: number): boolean {
  return (
    lat >= TR_BOUNDS.minLat &&
    lat <= TR_BOUNDS.maxLat &&
    lon >= TR_BOUNDS.minLon &&
    lon <= TR_BOUNDS.maxLon
  );
}

export function nearestProvince(lat: number, lon: number): string {
  let best = TR_PROVINCES[0];
  let bestDistance = Infinity;
  for (const province of TR_PROVINCES) {
    const distance = roughDistance(lat, lon, province);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = province;
    }
  }
  return best.name;
}

/**
 * Last resort for a coordinate outside the bundled table: the IANA time zone,
 * which the browser already exposes without any permission. `Europe/Istanbul`
 * becomes `Istanbul`, `America/New_York` becomes `New York`.
 */
export function regionFromTimeZone(timeZone: string | undefined): string | null {
  if (!timeZone) return null;
  const tail = timeZone.split('/').pop();
  if (!tail) return null;
  const name = tail.replace(/_/g, ' ').trim();
  // `UTC`, `GMT+3` and friends say nothing about where anyone lives.
  if (!name || name.length < 3 || /^(utc|gmt|etc)/i.test(name)) return null;
  return name.slice(0, MAX_REGION_LENGTH);
}

/**
 * The one function that sees coordinates. Returns a coarse name, or null when
 * the position cannot be reduced to anything meaningful — in which case the
 * honest answer is to store nothing.
 */
export function reduceToRegion(lat: number, lon: number, timeZone?: string): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (insideTurkiye(lat, lon)) return nearestProvince(lat, lon);
  return regionFromTimeZone(timeZone);
}
