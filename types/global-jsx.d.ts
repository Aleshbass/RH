// Global JSX namespace fallback for libraries that reference JSX.IntrinsicElements directly
// This avoids TS2503 errors from packages like react-markdown when using React 19 types.
export {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
