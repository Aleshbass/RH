import * as React from "react";
import { cn } from "@/lib/utils";

export interface PillProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  children: React.ReactNode;
}

export function Pill({ color = "#e5e7eb", children, className, ...props }: PillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium",
        className
      )}
      style={{ backgroundColor: color }}
      {...props}
    >
      {children}
    </div>
  );
}
