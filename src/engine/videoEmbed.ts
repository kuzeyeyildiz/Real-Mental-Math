/**
 * Turning a pasted video URL into something safe to put in an iframe.
 *
 * This is an allow-list, not a sanitiser. A teacher pastes whatever their browser
 * had in the address bar, and the only URLs that come back out are embed
 * endpoints on hosts we recognise. Anything else is refused with a reason the
 * teacher can act on — because the alternative, framing an arbitrary URL, hands
 * whatever is at the other end a frame inside a children's app.
 *
 * YouTube is resolved to `youtube-nocookie.com`, which does not write tracking
 * cookies until the child actually presses play.
 */

export type EmbedProvider = 'youtube' | 'vimeo';

export interface VideoEmbed {
  provider: EmbedProvider;
  /** The id on that provider, kept so the caller can build its own links. */
  id: string;
  /** Ready for an iframe `src`. */
  embedUrl: string;
  /** Where to send someone who would rather watch it on the original site. */
  watchUrl: string;
}

export const VIDEO_HOSTS_HINT =
  'YouTube and Vimeo links can be embedded. Paste the address from the video’s page.';

/** Ids are opaque, but they end up in a URL, so keep them to what a URL allows. */
const SAFE_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const NUMERIC_ID = /^[0-9]{1,20}$/;

function host(url: URL): string {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

/**
 * A YouTube id can arrive four ways: `watch?v=`, a `youtu.be` path, `/embed/`,
 * and `/shorts/`. All four are the same video, so all four are accepted.
 */
function youtubeId(url: URL): string | null {
  const h = host(url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (h === 'youtu.be') return segments[0] ?? null;
  if (h !== 'youtube.com' && h !== 'm.youtube.com' && h !== 'youtube-nocookie.com') return null;
  if (segments[0] === 'watch') return url.searchParams.get('v');
  if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
    return segments[1] ?? null;
  }
  return null;
}

function vimeoId(url: URL): string | null {
  if (host(url) !== 'vimeo.com' && host(url) !== 'player.vimeo.com') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  // player.vimeo.com/video/123456 and vimeo.com/123456 both end in the id.
  const candidate = segments[0] === 'video' ? segments[1] : segments[0];
  return candidate && NUMERIC_ID.test(candidate) ? candidate : null;
}

/**
 * Resolve a URL to an embed, or null when it isn't one we can frame. Null is not
 * an error to swallow — tell the teacher, so they can paste a different link
 * rather than wonder why nothing appeared for their class.
 */
export function resolveVideo(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  // A javascript: or data: URL is exactly what the allow-list exists to stop.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const yt = youtubeId(url);
  if (yt && SAFE_ID.test(yt)) {
    return {
      provider: 'youtube',
      id: yt,
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${yt}`,
    };
  }

  const vimeo = vimeoId(url);
  if (vimeo) {
    return {
      provider: 'vimeo',
      id: vimeo,
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
      watchUrl: `https://vimeo.com/${vimeo}`,
    };
  }

  return null;
}

export function isEmbeddableVideo(raw: string | null | undefined): boolean {
  return resolveVideo(raw) !== null;
}
