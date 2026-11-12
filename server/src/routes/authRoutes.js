const express = require("express");

const {
  registerStudent,
  login,
  getMe,
} = require("../controllers/authController");

const {
  authenticate,
} = require("../middleware/authMiddleware");

const router = express.Router();


router.post(
  "/register",
  registerStudent
);


router.post(
  "/login",
  login
);


router.get(
  "/me",
  authenticate,
  getMe
);


module.exports = router;