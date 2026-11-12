const express = require("express");

const {
  getStudentDashboard,
  getStudentServices,
  createStudentRequest,
  getStudentRequests,
  getStudentRequestDetails,
  resubmitStudentRequest,
  uploadCorrectedDocument,
  getStudentProfile,
  updateStudentProfile,
  uploadStudentProfilePhoto,
  getStudentCertificates,
  getStudentNotifications,
  markStudentNotificationRead,
} = require("../controllers/studentController");

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const {
  uploadDocument,
  uploadProfilePhoto,
} = require("../middleware/uploadMiddleware");

const { downloadCertificate, verifyCertificate } = require("../controllers/certificateController");
const router = express.Router();

// Certificate verification is public; download requires student authentication.
router.get("/certificates/verify/:certificateNumber", verifyCertificate);
router.get("/requests/:requestId/certificate/download", authenticate, authorizeRoles("STUDENT"), downloadCertificate);

// =========================================================
// STUDENT DASHBOARD
// =========================================================

router.get(
  "/profile",
  authenticate,
  authorizeRoles("STUDENT"),
  getStudentProfile
);

router.put(
  "/profile",
  authenticate,
  authorizeRoles("STUDENT"),
  updateStudentProfile
);

router.post("/profile/photo", authenticate, authorizeRoles("STUDENT"), uploadProfilePhoto.single("photo"), uploadStudentProfilePhoto);

router.get(
  "/dashboard",
  authenticate,
  authorizeRoles("STUDENT"),
  getStudentDashboard
);

// =========================================================
// AVAILABLE SERVICES
// =========================================================

router.get(
  "/services",
  authenticate,
  authorizeRoles("STUDENT"),
  getStudentServices
);

// Student certificate library and notifications
router.get("/certificates", authenticate, authorizeRoles("STUDENT"), getStudentCertificates);
router.get("/notifications", authenticate, authorizeRoles("STUDENT"), getStudentNotifications);
router.patch("/notifications/:notificationId/read", authenticate, authorizeRoles("STUDENT"), markStudentNotificationRead);

// =========================================================
// CREATE SERVICE REQUEST
// =========================================================

router.post(
  "/requests",
  authenticate,
  authorizeRoles("STUDENT"),
  uploadDocument.array("documents", 10),
  createStudentRequest
);

// =========================================================
// GET STUDENT REQUESTS
// =========================================================

router.get(
  "/requests",
  authenticate,
  authorizeRoles("STUDENT"),
  getStudentRequests
);

// =========================================================
// GET SINGLE REQUEST DETAILS
// =========================================================

router.get(
  "/requests/:requestId",
  authenticate,
  authorizeRoles("STUDENT"),
  getStudentRequestDetails
);

// =========================================================
// UPLOAD CORRECTED DOCUMENT
// =========================================================

router.post(
  "/requests/:requestId/documents/corrected",
  authenticate,
  authorizeRoles("STUDENT"),
  uploadDocument.single("document"),
  uploadCorrectedDocument
);

// =========================================================
// RESUBMIT CORRECTED REQUEST
// =========================================================

router.post(
  "/requests/:requestId/resubmit",
  authenticate,
  authorizeRoles("STUDENT"),
  resubmitStudentRequest
);

module.exports = router;