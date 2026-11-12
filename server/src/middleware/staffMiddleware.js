const pool = require("../config/db");

const ESTABLISHMENT_SECTION_ID = 9;

/**
 * Load authenticated staff details and their assigned section.
 */
const loadStaffSection = async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.email,
        u.role_id,
        r.name AS role_name,
        u.department_id,
        s.id AS section_id,
        s.code AS section_code,
        s.name AS section_name
      FROM users u
      INNER JOIN roles r
        ON r.id = u.role_id
      LEFT JOIN sections s
        ON s.id = u.section_id
      WHERE u.id = ?
        AND u.status = 'ACTIVE'
      LIMIT 1
      `,
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Staff account not found",
      });
    }

    const staff = rows[0];

    // Admin may not have an assigned section.
    if (!staff.section_id && staff.role_name !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "No section is assigned to this staff account",
      });
    }

    req.staffSection = {
      userId: staff.user_id,
      name: staff.user_name,
      email: staff.email,
      role: staff.role_name,
      departmentId: staff.department_id,
      sectionId: staff.section_id,
      sectionCode: staff.section_code,
      sectionName: staff.section_name,
    };

    return next();
  } catch (error) {
    console.error("Load staff section error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to determine staff section",
    });
  }
};

/**
 * Authorize staff access to clearance tasks
 * assigned to their section.
 */
const authorizeClearanceTask = async (req, res, next) => {
  try {
    if (!req.staffSection) {
      return res.status(403).json({
        success: false,
        message: "Staff section information is required",
      });
    }

    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Clearance task ID is required",
      });
    }

    if (!req.staffSection.sectionId) {
      return res.status(403).json({
        success: false,
        message: "An assigned section is required to access clearance tasks",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        ct.id,
        ct.no_due_request_id,
        ct.workflow_step_id,
        ct.section_id,
        ct.assigned_to,
        ct.status,
        ct.is_required,
        ct.remarks,
        ct.correction_reason,
        ct.started_at,
        ct.completed_at,
        r.id AS request_id,
        r.request_number,
        r.status AS request_status,
        r.current_step,
        s.code AS section_code,
        s.name AS section_name
      FROM clearance_tasks ct
      INNER JOIN no_due_requests nd
        ON nd.id = ct.no_due_request_id
      INNER JOIN requests r
        ON r.id = nd.request_id
      INNER JOIN sections s
        ON s.id = ct.section_id
      WHERE ct.id = ?
        AND ct.section_id = ?
      LIMIT 1
      `,
      [taskId, req.staffSection.sectionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Clearance task not found or access denied",
      });
    }

    req.clearanceTask = rows[0];

    return next();
  } catch (error) {
    console.error("Authorize clearance task error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify clearance task access",
    });
  }
};

/**
 * Authorize postal dispatch access.
 * Only Establishment SECTION_STAFF (section ID 9)
 * and ADMIN are permitted.
 */
const authorizePostalDispatch = (req, res, next) => {
  try {
    if (!req.staffSection) {
      return res.status(403).json({
        success: false,
        message: "Staff information is required",
      });
    }

    const { sectionId, role } = req.staffSection;

    if (role === "ADMIN") {
      return next();
    }

    if (
      role === "SECTION_STAFF" &&
      Number(sectionId) === ESTABLISHMENT_SECTION_ID
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message:
        "Only Establishment staff or Admin can handle postal dispatch",
    });
  } catch (error) {
    console.error("Authorize postal dispatch error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify postal dispatch access",
    });
  }
};

module.exports = {
  loadStaffSection,
  authorizeClearanceTask,
  authorizePostalDispatch,
};