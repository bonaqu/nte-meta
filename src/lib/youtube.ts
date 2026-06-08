export function getYoutubeId(url?: string) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1) || null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      return (
        parsed.searchParams.get('v') ||
        parsed.pathname.split('/').at(-1) ||
        null
      );
    }
  } catch {
    return null;
  }

  return null;
}

export function getYoutubeEmbedUrl(url?: string) {
  const id = getYoutubeId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
