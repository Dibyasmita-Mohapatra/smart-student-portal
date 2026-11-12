const express = require("express");
const { authenticate, authorizeRoles } = require("../middleware/authMiddleware");
const { getPrincipalDashboard } = require("../controllers/adminController");

const router = express.Router();

// Institution-wide read-only oversight is restricted to ADMIN (Principal).
router.get("/dashboard", authenticate, authorizeRoles("ADMIN"), getPrincipalDashboard);

module.exports = router;
