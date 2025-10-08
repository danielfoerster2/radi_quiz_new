import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HelpPage } from "./pages/HelpPage";
import { QuizGeneralitiesPage } from "./pages/QuizGeneralitiesPage";
import { QuizQuestionsPage } from "./pages/QuizQuestionsPage";
import { QuizCompilationPage } from "./pages/QuizCompilationPage";
import { QuizAnalysisPage } from "./pages/QuizAnalysisPage";
import { QuizEmailsPage } from "./pages/QuizEmailsPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/quizzes/:quizId" element={<QuizGeneralitiesPage />} />
        <Route path="/quizzes/:quizId/compile" element={<QuizCompilationPage />} />
        <Route path="/quizzes/:quizId/questions" element={<QuizQuestionsPage />} />
        <Route path="/quizzes/:quizId/analysis" element={<QuizAnalysisPage />} />
        <Route path="/quizzes/:quizId/emails" element={<QuizEmailsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
