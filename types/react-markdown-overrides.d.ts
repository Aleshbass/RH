// Explicit overrides for specific react-markdown internal module specifiers
// Prevent the compiler from loading the package's TypeScript sources which conflict with React 19 types.

declare module 'react-markdown/lib/complex-types' {
  const Mod: any
  export = Mod
}

declare module 'react-markdown/lib/complex-types.js' {
  const Mod: any
  export = Mod
}

declare module 'react-markdown/lib/*' {
  const Mod: any
  export = Mod
}
