import * as React from 'react';

// Polyfill useEffectEvent for React 19 builds
export const useEffectEvent = (fn) => {
  const ref = React.useRef(fn);
  React.useInsertionEffect(() => {
    ref.current = fn;
  });
  return React.useCallback((...args) => {
    return ref.current ? ref.current(...args) : undefined;
  }, []);
};

export default React;
export * from 'react';
