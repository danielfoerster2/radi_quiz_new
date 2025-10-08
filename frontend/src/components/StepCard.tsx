type StepCardProps = {
  step: string;
  title: string;
  description: string;
};

export const StepCard = ({ step, title, description }: StepCardProps) => {
  return (
    <article className="step-card">
      <span className="step-card__step">{step}</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
};
