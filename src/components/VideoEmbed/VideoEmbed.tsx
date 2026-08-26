import { resolveVideo } from '../../engine/videoEmbed';
import s from './VideoEmbed.module.css';

interface VideoEmbedProps {
  url: string | null | undefined;
  /** Announced to screen readers, so it should name the video, not the player. */
  title: string;
}

/**
 * A framed video, or nothing. The resolver decides whether a URL is embeddable at
 * all, so an unrecognised link falls back to a plain outbound link rather than
 * being framed on trust.
 *
 * `sandbox` is set as tightly as playback allows: scripts and same-origin are
 * needed by both players, but the frame cannot navigate the page it sits in, open
 * popups, or read anything of ours.
 *
 * `referrerPolicy` is `strict-origin-when-cross-origin`, not `no-referrer`.
 * Stripping the referrer entirely is the tempting choice, but both players check
 * the referring origin against the video's embedding permissions, so a video the
 * owner allowed on your site can still refuse to play. Sending the bare origin
 * satisfies that check while withholding the path — and the path is the part that
 * could name a classroom or a student.
 */
export function VideoEmbed({ url, title }: VideoEmbedProps) {
  const video = resolveVideo(url);

  if (!video) {
    if (!url) return null;
    return (
      <a className={s.fallback} href={url} target="_blank" rel="noopener noreferrer">
        Open the video ↗
      </a>
    );
  }

  return (
    <div className={s.frame}>
      <iframe
        className={s.iframe}
        src={video.embedUrl}
        title={title}
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups-to-escape-sandbox"
      />
    </div>
  );
}

export default VideoEmbed;
