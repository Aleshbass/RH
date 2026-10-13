// Type-only shim, wired up through "paths" in tsconfig.json.
// stream-chat-react@11 depends on react-markdown@8, whose shipped .ts sources do not
// type-check against React 19. Only stream-chat-react's .d.ts files import these types
// (our code never imports react-markdown), and the real package is still used at runtime.
import type { ComponentType, ReactElement } from "react";

export type PluggableList = any[];

export interface Options {
  children?: string;
  className?: string;
  components?: Record<string, ComponentType<any> | string | undefined>;
  remarkPlugins?: PluggableList;
  rehypePlugins?: PluggableList;
  [key: string]: unknown;
}

declare function ReactMarkdown(options: Options): ReactElement;
export default ReactMarkdown;
