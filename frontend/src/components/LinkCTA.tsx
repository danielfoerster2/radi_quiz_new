type LinkCTAProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
};

export const LinkCTA = ({ href, children, variant = "primary" }: LinkCTAProps) => {
  const className = ["link-cta", `link-cta--${variant}`].join(" ");
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
};
