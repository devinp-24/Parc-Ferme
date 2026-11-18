import { useCallback, useState } from 'react';

// Image load state as "which source has loaded", never a flag reset in an
// effect. A cached photo can finish loading before a post-render effect runs,
// and an effect that reset a `loaded` flag would then hide a photo that is
// already on screen -- permanently, since its load event has come and gone.
// Recording the source that loaded makes any new source "loading" by
// definition, and the ref callback catches images that were already complete
// before React attached onLoad.
export function useLoadedSrc(src) {
  const [loaded, setLoaded] = useState(null);
  const [failed, setFailed] = useState(null);
  const ref = useCallback((node) => {
    if (node && node.complete && node.naturalWidth > 0) setLoaded(node.getAttribute('src'));
  }, []);
  return {
    ref,
    ready: Boolean(src) && loaded === src,
    failed: Boolean(src) && failed === src,
    onLoad: () => setLoaded(src),
    onError: () => setFailed(src),
  };
}
