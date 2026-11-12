import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";

// Public pages
import Home from "./pages/public/Home";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// Route protection
import ProtectedRoute from "./routes/ProtectedRoute";
import RoleRoute from "./routes/RoleRoute";

// Student layout/pages
import StudentLayout from "./layouts/student/StudentLayout";
import Dashboard from "./pages/student/Dashboard";
import ApplyService from "./pages/student/ApplyService";
import ServiceApplication from "./pages/student/ServiceApplication";
import MyRequests from "./pages/student/MyRequests";
import RequestDetails from "./pages/student/RequestDetails";
import Profile from "./pages/student/Profile";
import Certificates from "./pages/student/Certificates";
import Notifications from "./pages/student/Notifications";
import Settings from "./pages/student/Settings";

// Staff layout/pages
import StaffLayout from "./layouts/staff/StaffLayout";
import StaffDashboard from "./pages/staff/StaffDashboard";
import StaffTaskDetails from "./pages/staff/StaffTaskDetails";
import PostalDispatch from "./pages/staff/PostalDispatch";
import PrincipalDashboard from "./pages/admin/PrincipalDashboard";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* =====================================================
              PUBLIC ROUTES
          ====================================================== */}

          <Route
            path="/"
            element={<Home />}
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/register"
            element={<Register />}
          />


          {/* =====================================================
              STUDENT ROUTES

              Only STUDENT users can access these routes.
          ====================================================== */}

          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <RoleRoute
                  allowedRoles={["STUDENT"]}
                />
              }
            >
              <Route element={<StudentLayout />}>

                {/* Student Dashboard */}
                <Route
                  path="/dashboard"
                  element={<Dashboard />}
                />

                {/* Services */}
                <Route
                  path="/apply-service"
                  element={<ApplyService />}
                />

                {/* Service Application */}
                <Route
                  path="/apply-service/:serviceCode"
                  element={<ServiceApplication />}
                />

                {/* Student Requests */}
                <Route
                  path="/student/requests"
                  element={<MyRequests />}
                />

                {/* Request Details */}
                <Route
                  path="/student/requests/:requestId"
                  element={<RequestDetails />}
                />
                <Route
                  path="/profile"
                  element={<Profile />}
                />
                <Route path="/student/certificates" element={<Certificates />} />
                <Route path="/student/notifications" element={<Notifications />} />
                <Route path="/student/settings" element={<Settings />} />

              </Route>
            </Route>
          </Route>


          {/* =====================================================
              STAFF ROUTES

              HOD and SECTION_STAFF can access these routes.
          ====================================================== */}

          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <RoleRoute
                  allowedRoles={[
                    "HOD",
                    "SECTION_STAFF",
                  ]}
                />
              }
            >
              <Route element={<StaffLayout />}>

                {/* Staff Dashboard */}
                <Route
                  path="/staff/dashboard"
                  element={<StaffDashboard />}
                />

                {/* Staff Task Details */}
                <Route
                  path="/staff/tasks/:taskId"
                  element={<StaffTaskDetails />}
                />
                <Route
                  path="/staff/postal-dispatch"
                  element={<PostalDispatch />}
                />

              </Route>
            </Route>
          </Route>


          {/* =====================================================
              ADMIN ROUTES

              We will build the Admin dashboard later.
              Keeping this protected now prevents students/staff
              from accessing admin URLs.
          ====================================================== */}

          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <RoleRoute
                  allowedRoles={["ADMIN"]}
                />
              }
            >

              <Route
                path="/admin/dashboard"
                element={<PrincipalDashboard />}
              />

            </Route>
          </Route>


          {/* =====================================================
              FALLBACK

              Any unknown URL goes back to homepage.
          ====================================================== */}

          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;