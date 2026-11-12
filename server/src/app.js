const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const staffRoutes = require("./routes/staffRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { razorpayWebhook } = require("./controllers/paymentController");

const app = express();

// Profile pictures are non-sensitive public avatars; private request documents remain protected.
app.use("/uploads/profile-photos", express.static(require("path").join(process.cwd(), "uploads", "profile-photos"), { fallthrough: false, maxAge: "1d" }));


app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const configured = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((v) => v.trim());
    const isLocalDevOrigin = process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}):5173$/.test(origin);
    if (configured.includes(origin) || isLocalDevOrigin) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true,
}));


// Razorpay signs the exact raw request body. This route must be registered before express.json().
app.post("/api/student/payments/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Smart Student Portal API is running",
  });
});


app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT 1 AS database_connected"
    );

    res.json({
      success: true,
      message: "API and database are healthy",
      database: rows[0].database_connected === 1,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "Database health check failed:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});


app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/student/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );
});