// Type override for react-markdown to avoid React 19 JSX generic incompatibilities
// This bypasses complex generic constraints in the library types that are not compatible with our setup.
declare module 'react-markdown' {
  import React from 'react'
  const ReactMarkdown: React.ComponentType<any>
  export default ReactMarkdown
}
