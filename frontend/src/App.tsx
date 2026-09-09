import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Onboarding from "./pages/Onboarding";
import IntroTour from "./pages/IntroTour";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import RecipesList from "./pages/RecipesList";
import RecipeDetail from "./pages/RecipeDetail";
import Daily from "./pages/Daily";
import WeightProgress from "./pages/WeightProgress";
import Intelligence from "./pages/Intelligence";
import Subscribe from "./pages/Subscribe";
import AdminHome from "./pages/admin/AdminHome";
import AdminTips from "./pages/admin/AdminTips";
import AdminLevels from "./pages/admin/AdminLevels";
import AdminStreakMilestones from "./pages/admin/AdminStreakMilestones";
import AdminRecipes from "./pages/admin/AdminRecipes";
import AdminRecipeEdit from "./pages/admin/AdminRecipeEdit";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminPayments from "./pages/admin/AdminPayments";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/intro" element={<IntroTour />} />
      <Route path="/intro/replay" element={<IntroTour replayOnly />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/recipes" element={<RecipesList />} />
      <Route path="/recipes/:slug" element={<RecipeDetail />} />
      <Route path="/daily" element={<Daily />} />
      <Route path="/progress/weight" element={<WeightProgress />} />
      <Route path="/intelligence" element={<Intelligence />} />
      <Route path="/subscribe" element={<Subscribe />} />
      <Route path="/admin" element={<AdminHome />} />
      <Route path="/admin/tips" element={<AdminTips />} />
      <Route path="/admin/levels" element={<AdminLevels />} />
      <Route path="/admin/streak-milestones" element={<AdminStreakMilestones />} />
      <Route path="/admin/recipes" element={<AdminRecipes />} />
      <Route path="/admin/recipes/:id" element={<AdminRecipeEdit />} />
      <Route path="/admin/notifications" element={<AdminNotifications />} />
      <Route path="/admin/payments" element={<AdminPayments />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
