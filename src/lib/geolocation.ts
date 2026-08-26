import { reduceToRegion } from '../engine/regionReduce';

/**
 * The only place in the app that touches the Geolocation API.
 *
 * Coordinates live inside `detectRegion` and nowhere else: they are never put
 * in React state, never logged, and never sent anywhere. What leaves this
 * function is a coarse place name such as "Ankara". The reduction is done
 * on-device against a bundled table, so no third-party geocoder ever sees a
 * child's position either.
 */

export type RegionFailure = 'denied' | 'unavailable' | 'timeout' | 'unmappable';

export type RegionOutcome = { ok: true; region: string } | { ok: false; reason: RegionFailure };

export const REGION_ERROR: Record<RegionFailure, string> = {
  denied:
    'Location permission was declined. Nothing was shared, and every other part of Numo works exactly as before.',
  unavailable: 'This device could not provide a location.',
  timeout: 'Finding your location took too long. Try again when you have a better signal.',
  unmappable: 'We could not work out a region from that location, so nothing was saved.',
};

const TIMEOUT_MS = 10_000;

/**
 * Whether the browser already knows the answer, so the UI can avoid offering a
 * prompt that will be refused instantly. Returns null where unsupported.
 */
export async function geolocationPermission(): Promise<PermissionState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

function currentTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function detectRegion(): Promise<RegionOutcome> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Reduced immediately, in this callback. The `coords` object is not
        // copied, stored, or passed on — only `region` survives this line.
        const region = reduceToRegion(
          position.coords.latitude,
          position.coords.longitude,
          currentTimeZone()
        );
        resolve(region ? { ok: true, region } : { ok: false, reason: 'unmappable' });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) resolve({ ok: false, reason: 'denied' });
        else if (error.code === error.TIMEOUT) resolve({ ok: false, reason: 'timeout' });
        else resolve({ ok: false, reason: 'unavailable' });
      },
      {
        // Coarse is all we need, and it spares the device a GPS fix.
        enableHighAccuracy: false,
        timeout: TIMEOUT_MS,
        // A position from the last quarter hour is plenty for a province name.
        maximumAge: 900_000,
      }
    );
  });
}
