import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Positions an underline under the active item inside `containerRef`, matching
 * app shell nav (`App.tsx`). Updates on `activeIndex` change, resize, and
 * container resize (ResizeObserver).
 */
export function useSlidingUnderlineIndicator(
  containerRef: RefObject<HTMLElement | null>,
  itemRefs: readonly RefObject<HTMLElement | null>[],
  activeIndex: number,
) {
  const itemRefsRef = useRef(itemRefs);
  itemRefsRef.current = itemRefs;

  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  const updateIndicator = useCallback(() => {
    const nav = containerRef.current;
    const el = itemRefsRef.current[activeIndex]?.current;
    if (!nav || !el) {
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({
      left: elRect.left - navRect.left,
      width: elRect.width,
    });
  }, [containerRef, activeIndex]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useLayoutEffect(() => {
    const nav = containerRef.current;
    if (!nav) {
      return;
    }
    const ro = new ResizeObserver(() => {
      updateIndicator();
    });
    ro.observe(nav);
    window.addEventListener("resize", updateIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [containerRef, updateIndicator]);

  return indicator;
}
