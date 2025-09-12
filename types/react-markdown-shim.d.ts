// Wildcard shims for react-markdown internals to avoid TS generic issues
// This ensures any subpath import resolves to 'any' and prevents type expansion
declare module 'react-markdown/*' {
  const ReactMarkdownAny: any
  export = ReactMarkdownAny
}

declare module 'react-markdown/lib/*' {
  const ReactMarkdownLibAny: any
  export = ReactMarkdownLibAny
}
