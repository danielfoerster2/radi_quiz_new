import "./FeatureCard.css";

type FeatureCardProps = {
  title: string;
  description: string;
  icon: string;
};

export const FeatureCard = ({ title, description, icon }: FeatureCardProps) => {
  return (
    <article className="feature-card">
      <div className="feature-card__icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
};
