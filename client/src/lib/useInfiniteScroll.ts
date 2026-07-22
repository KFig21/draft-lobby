import { useEffect, useRef } from 'react';

/**
 * Attach the returned ref to a sentinel element at the end of a list; calls
 * `onLoadMore` once it scrolls near the viewport. Guards against duplicate
 * fires while a page is already loading or there's nothing left to fetch.
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  { hasMore, loading }: { hasMore: boolean; loading: boolean },
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  return sentinelRef;
}
