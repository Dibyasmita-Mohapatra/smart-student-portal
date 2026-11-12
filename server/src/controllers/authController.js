const bcrypt = require("bcryptjs");

const pool = require("../config/db");
const { generateToken } = require("../utils/jwt");


const registerStudent = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      name,
      email,
      password,
      rollNumber,
      registrationNumber,
      departmentCode,
      batch,
      hostelStatus,
      phone,
    } = req.body;

    if (
      !name ||
      !email ||
      !password ||
      !rollNumber ||
      !registrationNumber ||
      !departmentCode ||
      !batch
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existingUser] = await connection.query(
      "SELECT id FROM users WHERE email = ?",
      [normalizedEmail]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const [existingRoll] = await connection.query(
      "SELECT id FROM students WHERE roll_number = ?",
      [rollNumber.trim()]
    );

    if (existingRoll.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This roll number is already registered",
      });
    }

    const [existingRegistration] = await connection.query(
      "SELECT id FROM students WHERE registration_number = ?",
      [registrationNumber.trim()]
    );

    if (existingRegistration.length > 0) {
      return res.status(409).json({
        success: false,
        message: "This registration number is already registered",
      });
    }

    const [departmentRows] = await connection.query(
      "SELECT id FROM departments WHERE code = ?",
      [departmentCode.trim().toUpperCase()]
    );

    if (departmentRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid department",
      });
    }

    const departmentId = departmentRows[0].id;

    const [roleRows] = await connection.query(
      "SELECT id FROM roles WHERE name = 'STUDENT'"
    );

    if (roleRows.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Student role is not configured",
      });
    }

    const roleId = roleRows[0].id;

    const passwordHash = await bcrypt.hash(password, 12);

    await connection.beginTransaction();

    const [userResult] = await connection.query(
      `
      INSERT INTO users
      (
        name,
        email,
        password_hash,
        role_id,
        department_id,
        phone,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
      `,
      [
        name.trim(),
        normalizedEmail,
        passwordHash,
        roleId,
        departmentId,
        phone?.trim() || null,
      ]
    );

    const userId = userResult.insertId;

    const validHostelStatus =
      hostelStatus === "HOSTELLER"
        ? "HOSTELLER"
        : "DAY_SCHOLAR";

    const [studentResult] = await connection.query(
      `
      INSERT INTO students
      (
        user_id,
        roll_number,
        registration_number,
        department_id,
        batch,
        hostel_status
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        rollNumber.trim(),
        registrationNumber.trim(),
        departmentId,
        batch.trim(),
        validHostelStatus,
      ]
    );

    await connection.commit();

    const token = generateToken({
      userId,
      role: "STUDENT",
      departmentId,
      studentId: studentResult.insertId,
    });

    return res.status(201).json({
      success: true,
      message: "Student account created successfully",
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        role: "STUDENT",
        departmentId,
        studentId: studentResult.insertId,
      },
    });
  } catch (error) {
    await connection.rollback();

    console.error("Student registration error:", error);

    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  } finally {
    connection.release();
  }
};


const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.password_hash,
        u.status,
        u.profile_photo_path,
        u.department_id,
        r.name AS role_name,
        s.id AS student_id,
        s.roll_number,
        s.registration_number,
        s.batch,
        s.hostel_status,
        d.name AS department_name,
        d.code AS department_code
      FROM users u
      INNER JOIN roles r
        ON r.id = u.role_id
      LEFT JOIN students s
        ON s.user_id = u.id
      LEFT JOIN departments d
        ON d.id = u.department_id
      WHERE u.email = ?
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "This account is not active",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    await pool.query(
      "UPDATE users SET last_login_at = NOW() WHERE id = ?",
      [user.id]
    );

    const token = generateToken({
      userId: user.id,
      role: user.role_name,
      departmentId: user.department_id,
      studentId: user.student_id || null,
    });

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_name,
        departmentId: user.department_id,
        departmentName: user.department_name,
        departmentCode: user.department_code,
        studentId: user.student_id || null,
        rollNumber: user.roll_number || null,
        registrationNumber: user.registration_number || null,
        batch: user.batch || null,
        hostelStatus: user.hostel_status || null,
        profilePhotoUrl: user.profile_photo_path ? `/uploads/profile-photos/${require("path").basename(user.profile_photo_path)}` : null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};


const getMe = async (req, res) => {
  try {
    const [users] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.status,
        u.department_id,
        u.section_id,
        r.name AS role_name,
        sec.code AS section_code,
        sec.name AS section_name,
        d.name AS department_name,
        d.code AS department_code,
        s.id AS student_id,
        s.roll_number,
        s.registration_number,
        s.batch,
        s.hostel_status,
        u.phone,
        u.profile_photo_path
      FROM users u
      INNER JOIN roles r
        ON r.id = u.role_id
      LEFT JOIN departments d
        ON d.id = u.department_id
      LEFT JOIN sections sec
        ON sec.id = u.section_id
      LEFT JOIN students s
        ON s.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
      `,
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_name,
        status: user.status,
        departmentId: user.department_id,
        departmentName: user.department_name,
        departmentCode: user.department_code,
        studentId: user.student_id || null,
        rollNumber: user.roll_number || null,
        registrationNumber: user.registration_number || null,
        batch: user.batch || null,
        hostelStatus: user.hostel_status || null,
        phone: user.phone || null,
        profilePhotoUrl: user.profile_photo_path ? `/uploads/profile-photos/${require("path").basename(user.profile_photo_path)}` : null,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch user",
    });
  }
};


module.exports = {
  registerStudent,
  login,
  getMe,
};