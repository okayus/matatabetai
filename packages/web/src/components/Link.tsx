import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { navigate } from "../router";

export function Link({
  href,
  children,
  className,
  style,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={onClick} className={className} style={style}>
      {children}
    </a>
  );
}
