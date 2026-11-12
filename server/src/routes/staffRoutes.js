
const express = require("express");

const {
  authenticate,
  authorizeRoles,
} = require("../middleware/authMiddleware");

const {
  loadStaffSection,
  authorizePostalDispatch,
} = require("../middleware/staffMiddleware");

const {
  getStaffDashboard,
  getStaffTaskDetails,
  reviewStaffTask,
  viewStaffDocument,
  uploadStaffProfilePhoto,
} = require("../controllers/staffController");

const {
  getPostalDispatchQueue,
  updatePostalDispatch,
} = require("../controllers/postalDispatchController");

const { uploadProfilePhoto } = require("../middleware/uploadMiddleware");
const { generateCertificate } = require("../controllers/certificateController");
const router = express.Router();

router.post("/profile/photo", authenticate, authorizeRoles("HOD", "SECTION_STAFF", "ADMIN"), uploadProfilePhoto.single("photo"), uploadStaffProfilePhoto);

// Generate only for requests that have reached an approved status.
router.post("/requests/:requestId/certificate/generate", authenticate, authorizeRoles("HOD", "SECTION_STAFF"), loadStaffSection, generateCertificate);

/*
 * =========================================================
 * STAFF DASHBOARD
 * =========================================================
 * Allowed roles: HOD, SECTION_STAFF
 */
router.get(
  "/dashboard",
  authenticate,
  authorizeRoles("HOD", "SECTION_STAFF"),
  loadStaffSection,
  getStaffDashboard
);

/*
 * =========================================================
 * GET STAFF TASK DETAILS
 * =========================================================
 * Example: GET /api/staff/tasks/ND-7
 */
router.get(
  "/tasks/:taskId",
  authenticate,
  authorizeRoles("HOD", "SECTION_STAFF"),
  loadStaffSection,
  getStaffTaskDetails
);

/*
 * =========================================================
 * REVIEW STAFF TASK
 * =========================================================
 * Example: POST /api/staff/tasks/SR-7/review
 *
 * Body:
 * {
 *   "action": "APPROVE",
 *   "remarks": "Documents verified successfully"
 * }
 */
router.post(
  "/tasks/:taskId/review",
  authenticate,
  authorizeRoles("HOD", "SECTION_STAFF"),
  loadStaffSection,
  reviewStaffTask
);

/*
 * =========================================================
 * VIEW STAFF DOCUMENT
 * =========================================================
 * Example: GET /api/staff/documents/12/view
 */
router.get(
  "/documents/:documentId/view",
  authenticate,
  authorizeRoles("HOD", "SECTION_STAFF"),
  loadStaffSection,
  viewStaffDocument
);

/*
 * =========================================================
 * POSTAL DISPATCH QUEUE
 * =========================================================
 * GET /api/staff/postal-dispatch
 *
 * Only Establishment staff assigned to section ID 9
 * can access the queue.
 */
router.get(
  "/postal-dispatch",
  authenticate,
  authorizeRoles("HOD", "SECTION_STAFF"),
  loadStaffSection,
  authorizePostalDispatch,
  getPostalDispatchQueue
);

/*
 * =========================================================
 * UPDATE POSTAL DISPATCH
 * =========================================================
 * PATCH /api/staff/postal-dispatch/:deliveryId
 *
 * Used to record courier/tracking details and update
 * dispatch or delivery status.
 */
router.patch(
  "/postal-dispatch/:deliveryId",
  authenticate,
  authorizeRoles("HOD", "SECTION_STAFF"),
  loadStaffSection,
  authorizePostalDispatch,
  updatePostalDispatch
);

module.exports = router;
