import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PageTransition from "./components/PageTransition";

// كل صفحة بـchunk منفصل (code-splitting حسب الروت) — قبل هذا التعديل كل الصفحات (بما فيها
// كل صفحات /admin/* اللي أغلب المستخدمين ما يزورونها أبدًا) كانت مضغوطة بملف JS وحد (566KB)
// يتحمّل عند أول زيارة للتطبيق بغض النظر عن الصفحة المطلوبة فعليًا.
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const AccountBanned = lazy(() => import("./pages/AccountBanned"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const IntroTour = lazy(() => import("./pages/IntroTour"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const RecipesList = lazy(() => import("./pages/RecipesList"));
const RecipeDetail = lazy(() => import("./pages/RecipeDetail"));
const Daily = lazy(() => import("./pages/Daily"));
const WeightProgress = lazy(() => import("./pages/WeightProgress"));
const Intelligence = lazy(() => import("./pages/Intelligence"));
const Subscribe = lazy(() => import("./pages/Subscribe"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminTips = lazy(() => import("./pages/admin/AdminTips"));
const AdminLevels = lazy(() => import("./pages/admin/AdminLevels"));
const AdminStreakMilestones = lazy(() => import("./pages/admin/AdminStreakMilestones"));
const AdminRecipes = lazy(() => import("./pages/admin/AdminRecipes"));
const AdminRecipeEdit = lazy(() => import("./pages/admin/AdminRecipeEdit"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments"));
const AdminFeedback = lazy(() => import("./pages/admin/AdminFeedback"));

function PageLoadingFallback() {
  return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>...</div>;
}

export default function App() {
  return (
    <PageTransition>
    <Suspense fallback={<PageLoadingFallback />}>
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/account-banned" element={<AccountBanned />} />
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
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/tips" element={<AdminTips />} />
      <Route path="/admin/levels" element={<AdminLevels />} />
      <Route path="/admin/streak-milestones" element={<AdminStreakMilestones />} />
      <Route path="/admin/recipes" element={<AdminRecipes />} />
      <Route path="/admin/recipes/:id" element={<AdminRecipeEdit />} />
      <Route path="/admin/notifications" element={<AdminNotifications />} />
      <Route path="/admin/payments" element={<AdminPayments />} />
      <Route path="/admin/feedback" element={<AdminFeedback />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
    </Suspense>
    </PageTransition>
  );
}
