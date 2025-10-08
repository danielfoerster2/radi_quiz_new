import { Link, useParams } from "react-router-dom";
import "./QuizTabs.css";

type QuizTab = {
  label: string;
  path: string;
};

const tabs: QuizTab[] = [
  { label: "Généralités", path: "" },
  { label: "Sujets", path: "subjects" },
  { label: "Questions", path: "questions" },
  { label: "Compilation", path: "compile" },
  { label: "Analyse", path: "analysis" },
  { label: "Emails", path: "emails" },
];

type QuizTabsProps = {
  active: string;
};

export const QuizTabs = ({ active }: QuizTabsProps) => {
  const { quizId } = useParams<{ quizId: string }>();

  return (
    <nav className="quiz-tabs" aria-label="Sections du quiz">
      {tabs.map((tab) => {
        const href = tab.path ? `/quizzes/${quizId}/${tab.path}` : `/quizzes/${quizId}`;
        const isActive = active === tab.path;
        return (
          <Link
            key={tab.label}
            to={href}
            className={`quiz-tabs__item ${isActive ? "quiz-tabs__item--active" : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
};
