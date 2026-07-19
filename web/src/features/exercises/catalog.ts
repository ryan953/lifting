import { useQuery } from '@tanstack/react-query';
import type { Catalog, CatalogExercise } from '@lifting/shared';

/** Static catalog: fetched once, precached by the service worker. */
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<Catalog> => {
      const res = await fetch('/catalog/catalog.json');
      if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
      return res.json();
    },
  });
}

export function catalogImageUrl(imagePath: string): string {
  return `/catalog/images/${imagePath}`;
}

export function youtubeSearchUrl(ex: CatalogExercise): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex.name} exercise form`)}`;
}
