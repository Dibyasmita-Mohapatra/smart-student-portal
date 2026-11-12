const express = require("express");
const {
  testPaymentSuccess,
  createRazorpayOrder,
  verifyRazorpayPayment,
  syncPostalPaymentStatus,
} = require("../controllers/paymentController");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");
const router = express.Router();

router.post("/:paymentId/create-order", authenticate, authorizeRoles("STUDENT"), createRazorpayOrder);
router.post("/:paymentId/verify", authenticate, authorizeRoles("STUDENT"), verifyRazorpayPayment);
router.get("/:paymentId/status", authenticate, authorizeRoles("STUDENT"), syncPostalPaymentStatus);
// Kept only for local development; controller rejects this endpoint in production.
router.post("/:paymentId/test-success", authenticate, authorizeRoles("STUDENT"), testPaymentSuccess);

module.exports = router;
