const pool = require("../config/db");

const getPrincipalDashboard = async (req, res) => {
  try {
    const [overviewRows] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='STUDENT' AND u.status='ACTIVE') AS activeStudents,
        (SELECT COUNT(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name IN ('HOD','SECTION_STAFF') AND u.status='ACTIVE') AS activeStaff,
        (SELECT COUNT(*) FROM departments) AS departments,
        (SELECT COUNT(*) FROM sections) AS sections,
        (SELECT COUNT(*) FROM requests) AS totalRequests,
        (SELECT COUNT(*) FROM requests WHERE status IN ('SUBMITTED','UNDER_REVIEW','CLEARANCE_IN_PROGRESS','RESUBMITTED','FINAL_REVIEW','ALL_CLEARANCES_COMPLETED')) AS inProgressRequests,
        (SELECT COUNT(*) FROM requests WHERE status='COMPLETED') AS completedRequests,
        (SELECT COUNT(*) FROM requests WHERE status='REJECTED') AS rejectedRequests,
        (SELECT COUNT(*) FROM requests WHERE status='CORRECTION_REQUIRED') AS correctionRequests,
        (SELECT COUNT(*) FROM certificates) AS certificatesIssued
    `);

    const [statusRows] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM requests
      GROUP BY status
      ORDER BY count DESC
    `);

    const [departmentRows] = await pool.query(`
      SELECT d.id, d.code, d.name,
        COUNT(DISTINCT s.id) AS studentCount,
        COUNT(DISTINCT r.id) AS requestCount,
        SUM(CASE WHEN r.status IN ('SUBMITTED','UNDER_REVIEW','CLEARANCE_IN_PROGRESS','RESUBMITTED','FINAL_REVIEW','ALL_CLEARANCES_COMPLETED') THEN 1 ELSE 0 END) AS activeRequestCount,
        SUM(CASE WHEN r.status='COMPLETED' THEN 1 ELSE 0 END) AS completedRequestCount
      FROM departments d
      LEFT JOIN students s ON s.department_id=d.id
      LEFT JOIN requests r ON r.student_id=s.id
      GROUP BY d.id, d.code, d.name
      ORDER BY d.name
    `);

    const [sectionRows] = await pool.query(`
      SELECT sec.id, sec.code, sec.name,
        COALESCE(d.name, 'Institution-wide') AS departmentName,
        COALESCE(staff.staffCount, 0) AS staffCount,
        COALESCE(service.assignedServiceTasks, 0) AS assignedServiceTasks,
        COALESCE(service.pendingServiceTasks, 0) AS pendingServiceTasks,
        COALESCE(clearance.clearanceTasks, 0) AS clearanceTasks,
        COALESCE(clearance.pendingClearanceTasks, 0) AS pendingClearanceTasks
      FROM sections sec
      LEFT JOIN departments d ON d.id=sec.department_id
      LEFT JOIN (
        SELECT section_id, COUNT(*) AS staffCount
        FROM users WHERE status='ACTIVE' GROUP BY section_id
      ) staff ON staff.section_id=sec.id
      LEFT JOIN (
        SELECT section_id, COUNT(*) AS assignedServiceTasks,
          SUM(CASE WHEN status IN ('PENDING','UNDER_REVIEW','RESUBMITTED') THEN 1 ELSE 0 END) AS pendingServiceTasks
        FROM request_staff_reviews GROUP BY section_id
      ) service ON service.section_id=sec.id
      LEFT JOIN (
        SELECT section_id, COUNT(*) AS clearanceTasks,
          SUM(CASE WHEN status IN ('PENDING','UNDER_REVIEW','RESUBMITTED') AND is_required=1 THEN 1 ELSE 0 END) AS pendingClearanceTasks
        FROM clearance_tasks GROUP BY section_id
      ) clearance ON clearance.section_id=sec.id
      ORDER BY sec.name
    `);

    const [recentRequests] = await pool.query(`
      SELECT r.id, r.request_number AS requestNumber, r.status,
        r.created_at AS createdAt, r.submitted_at AS submittedAt,
        u.name AS studentName, s.roll_number AS rollNumber,
        d.code AS departmentCode, d.name AS departmentName,
        dt.code AS serviceCode, dt.name AS serviceName
      FROM requests r
      JOIN students s ON s.id=r.student_id
      JOIN users u ON u.id=s.user_id
      LEFT JOIN departments d ON d.id=s.department_id
      JOIN document_types dt ON dt.id=r.document_type_id
      ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
    `);

    const [paymentRows] = await pool.query(`
      SELECT
        COUNT(*) AS totalPayments,
        SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END) AS successfulPayments,
        SUM(CASE WHEN status='PENDING' THEN 1 ELSE 0 END) AS pendingPayments,
        SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failedPayments,
        COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0) AS collectedAmount
      FROM payments
    `);

    const [deliveryRows] = await pool.query(`
      SELECT delivery_status AS status, COUNT(*) AS count
      FROM request_deliveries
      WHERE delivery_type='POSTAL'
      GROUP BY delivery_status
    `);

    const [activityRows] = await pool.query(`
      SELECT al.id, al.action, al.entity_type AS entityType,
        al.description, al.created_at AS createdAt,
        u.name AS actorName, r.request_number AS requestNumber
      FROM audit_logs al
      LEFT JOIN users u ON u.id=al.user_id
      LEFT JOIN requests r ON r.id=al.request_id
      ORDER BY al.created_at DESC
      LIMIT 15
    `);

    return res.json({
      success: true,
      principal: { userId: req.user.userId, name: req.user.name || null, role: "ADMIN" },
      overview: overviewRows[0],
      requestStatuses: statusRows,
      departments: departmentRows,
      sections: sectionRows,
      recentRequests,
      payments: paymentRows[0],
      postalDeliveries: deliveryRows,
      recentActivity: activityRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Principal dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load the institution overview. Check that the portal migrations have been applied.",
    });
  }
};

module.exports = { getPrincipalDashboard };
