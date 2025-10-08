import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type LinkCTAProps = {
  href?: string;
  to?: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
};

export const LinkCTA = ({ href, to, children, variant = "primary" }: LinkCTAProps) => {
  const className = ["link-cta", `link-cta--${variant}`].join(" ");

  if (to) {
    return (
      <Link className={className} to={to}>
        {children}
      </Link>
    );
  }

  if (!href) {
    throw new Error("LinkCTA requires either 'to' or 'href'.");
  }

  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
};
