import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Loader from "@food/components/Loader";

// Auth Pages (Lazy loaded)
const Welcome = lazy(() => import("./pages/auth/Welcome"))
const SignIn = lazy(() => import("./pages/auth/SignIn"))
const OTP = lazy(() => import("./pages/auth/OTP"))
const SignupStep1 = lazy(() => import("./pages/auth/SignupStep1"))
const SignupStep2 = lazy(() => import("./pages/auth/SignupStep2"))

// V2 Pages
import DeliveryHomeV2 from './pages/DeliveryHomeV2';
import OrderDetailV2 from './pages/OrderDetailV2';
import { PayoutV2 } from './pages/pocket/PayoutV2';
import { PocketStatementV2 } from './pages/pocket/PocketStatementV2';
import { ProfileBankV2 } from './pages/profile/ProfileBankV2';
import { ProfileDocsV2 } from './pages/profile/ProfileDocsV2';
import ProfileReviewsV2 from './pages/profile/ProfileReviewsV2';
import { SupportTicketsV2 } from './pages/help/SupportTicketsV2';
import { CreateSupportTicketV2 } from './pages/help/CreateSupportTicketV2';
import { ViewSupportTicketV2 } from './pages/help/ViewSupportTicketV2';
import ShowIdCardV2 from './pages/help/ShowIdCardV2';
import { PocketDetailsV2 } from './pages/pocket/PocketDetailsV2';
import { ProfileDetailsV2 } from './pages/profile/ProfileDetailsV2';
import TermsAndConditionsV2 from './pages/TermsAndConditionsV2';
import PrivacyPolicyV2 from './pages/PrivacyPolicyV2';
import NotificationsV2 from './pages/NotificationsV2';
import ShopV2 from './pages/ShopV2';



const DeliveryV2Router = () => {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        {/* Auth routes */}
        <Route path="welcome" element={<Welcome />} />
        <Route path="login" element={<SignIn />} />
        <Route path="otp" element={<OTP />} />
        <Route path="signup" element={<Navigate to="/food/delivery/login" replace />} />
        <Route path="signup/details" element={<SignupStep1 />} />
        <Route path="signup/documents" element={<SignupStep2 />} />
        <Route path="terms" element={<TermsAndConditionsV2 />} />
        <Route path="privacy" element={<PrivacyPolicyV2 />} />

        {/* Protected Core Routes */}
        <Route path="/" element={<ProtectedRoute><DeliveryHomeV2 tab="feed" /></ProtectedRoute>} />
        <Route path="/feed" element={<ProtectedRoute><DeliveryHomeV2 tab="feed" /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><DeliveryHomeV2 tab="orders" /></ProtectedRoute>} />
        <Route path="/orders/:orderId" element={<ProtectedRoute><OrderDetailV2 /></ProtectedRoute>} />
        <Route path="/pocket" element={<ProtectedRoute><DeliveryHomeV2 tab="pocket" /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><DeliveryHomeV2 tab="history" /></ProtectedRoute>} />
        <Route path="/shop" element={<ProtectedRoute><ShopV2 /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><DeliveryHomeV2 tab="profile" /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsV2 /></ProtectedRoute>} />
        <Route path="/profile/details" element={<ProtectedRoute><ProfileDetailsV2 /></ProtectedRoute>} />
        <Route path="/profile/reviews" element={<ProtectedRoute><ProfileReviewsV2 /></ProtectedRoute>} />
        <Route path="/profile/bank" element={<ProtectedRoute><ProfileBankV2 /></ProtectedRoute>} />
        <Route path="/profile/documents" element={<ProtectedRoute><ProfileDocsV2 /></ProtectedRoute>} />
        
        {/* Support Systems */}
        <Route path="/help/tickets" element={<ProtectedRoute><SupportTicketsV2 /></ProtectedRoute>} />
        <Route path="/help/tickets/create" element={<ProtectedRoute><CreateSupportTicketV2 /></ProtectedRoute>} />
        <Route path="/help/tickets/:ticketId" element={<ProtectedRoute><ViewSupportTicketV2 /></ProtectedRoute>} />
        <Route path="/help/id-card" element={<ProtectedRoute><ShowIdCardV2 /></ProtectedRoute>} />
        <Route path="/profile/terms" element={<ProtectedRoute><TermsAndConditionsV2 /></ProtectedRoute>} />
        <Route path="/profile/privacy" element={<ProtectedRoute><PrivacyPolicyV2 /></ProtectedRoute>} />
        
        {/* Financial Deep-Pages */}
        <Route path="/pocket/payout" element={<ProtectedRoute><PayoutV2 /></ProtectedRoute>} />
        <Route path="/pocket/statement" element={<ProtectedRoute><PocketStatementV2 /></ProtectedRoute>} />
        <Route path="/pocket/details" element={<ProtectedRoute><PocketDetailsV2 /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/food/delivery" replace />} />
      </Routes>
    </Suspense>
  );
};

export default DeliveryV2Router;
