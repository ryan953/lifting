import { useState } from 'react';

interface Props {
  videoId?: string;
  searchUrl: string;
  title: string;
}

/**
 * Curated video: lazy youtube-nocookie iframe, loaded only on tap (keeps the
 * page light on gym data). No curated id: plain YouTube search link.
 */
export function VideoEmbed({ videoId, searchUrl, title }: Props) {
  const [playing, setPlaying] = useState(false);

  if (!videoId) {
    return (
      <a
        href={searchUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block rounded-lg bg-surface px-4 py-2 text-sm text-accent"
      >
        ▶ Find a demo on YouTube
      </a>
    );
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="relative mt-2 block w-full overflow-hidden rounded-xl"
        aria-label={`Play demonstration video for ${title}`}
      >
        <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" className="w-full" loading="lazy" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/70 px-5 py-3 text-2xl">▶</span>
        </span>
      </button>
    );
  }

  return (
    <iframe
      className="mt-2 aspect-video w-full rounded-xl"
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
      title={`Demonstration: ${title}`}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}
