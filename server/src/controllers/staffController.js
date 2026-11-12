// server/controllers/staffController.js

const pool = require("../config/db");
const fs = require("fs");
const path = require("path");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

const parseTaskId = (value) => {
  const match = String(value || "").match(/^(ND|SR)-(\d+)$/i);

  if (!match) {
    return null;
  }

  const id = Number(match[2]);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  return {
    type: match[1].toUpperCase(),
    id,
  };
};

const parseApplicationData = (data) => {
  if (!data) return null;

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  return data;
};

const getNewStatus = (action) => {
  if (action === "APPROVE") return "APPROVED";
  if (action === "CORRECTION_REQUIRED") {
    return "CORRECTION_REQUIRED";
  }
  return "REJECTED";
};

const isReviewable = (status) =>
  ["PENDING", "UNDER_REVIEW", "RESUBMITTED"].includes(status);

const getStaffInfo = (staffSection) => ({
  userId: staffSection.userId,
  name: staffSection.name,
  email: staffSection.email,
  role: staffSection.role,
  departmentId: staffSection.departmentId,
  sectionId: staffSection.sectionId,
  sectionCode: staffSection.sectionCode,
  sectionName: staffSection.sectionName,
});

/*
|--------------------------------------------------------------------------
| GET STAFF DASHBOARD
|--------------------------------------------------------------------------
*/

const getStaffDashboard = async (req, res) => {
  try {
    const staffSection = req.staffSection;

    if (!staffSection) {
      return res.status(403).json({
        success: false,
        message: "Staff section information is required",
      });
    }

    const sectionId = staffSection.sectionId;

    /*
     * No-Due tasks
     */

    const [noDueTasks] = await pool.query(
      `
      SELECT
        CONCAT('ND-', ct.id) AS id,
        'NO_DUE' AS taskType,

        ct.id AS originalTaskId,
        ct.no_due_request_id AS noDueRequestId,
        ct.section_id AS sectionId,
        ct.assigned_to AS assignedTo,

        ct.status,
        ct.is_required AS isRequired,
        ct.remarks,
        ct.correction_reason AS correctionReason,

        ct.created_at AS createdAt,
        ct.updated_at AS updatedAt,

        r.id AS requestId,
        r.request_number AS requestNumber,
        r.status AS requestStatus,
        r.submitted_at AS submittedAt,

        u.name AS studentName,
        u.email AS studentEmail,
        u.phone AS studentPhone,

        s.roll_number AS rollNumber,
        s.registration_number AS registrationNumber,
        s.batch,

        d.code AS departmentCode,
        d.name AS departmentName,

        dt.code AS documentCode,
        dt.name AS documentName,

        sec.code AS sectionCode,
        sec.name AS sectionName

      FROM clearance_tasks ct

      INNER JOIN no_due_requests nd
        ON nd.id = ct.no_due_request_id

      INNER JOIN requests r
        ON r.id = nd.request_id

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN users u
        ON u.id = s.user_id

      INNER JOIN departments d
        ON d.id = s.department_id

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      INNER JOIN sections sec
        ON sec.id = ct.section_id

      WHERE ct.section_id = ?
        AND ct.is_required = 1
        AND dt.code = 'NO_DUE'

      ORDER BY ct.created_at DESC
      `,
      [sectionId]
    );

    /*
     * Regular service reviews
     */

    const [serviceTasks] = await pool.query(
      `
      SELECT
        CONCAT('SR-', sr.id) AS id,
        'SERVICE' AS taskType,

        sr.id AS originalTaskId,
        NULL AS noDueRequestId,
        sr.section_id AS sectionId,
        sr.assigned_to AS assignedTo,

        sr.status,
        1 AS isRequired,
        sr.remarks,
        sr.correction_reason AS correctionReason,

        sr.created_at AS createdAt,
        sr.updated_at AS updatedAt,

        r.id AS requestId,
        r.request_number AS requestNumber,
        r.status AS requestStatus,
        r.submitted_at AS submittedAt,

        u.name AS studentName,
        u.email AS studentEmail,
        u.phone AS studentPhone,

        s.roll_number AS rollNumber,
        s.registration_number AS registrationNumber,
        s.batch,

        d.code AS departmentCode,
        d.name AS departmentName,

        dt.code AS documentCode,
        dt.name AS documentName,

        sec.code AS sectionCode,
        sec.name AS sectionName

      FROM request_staff_reviews sr

      INNER JOIN requests r
        ON r.id = sr.request_id

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN users u
        ON u.id = s.user_id

      INNER JOIN departments d
        ON d.id = s.department_id

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      INNER JOIN sections sec
        ON sec.id = sr.section_id

      WHERE sr.section_id = ?

      ORDER BY sr.created_at DESC
      `,
      [sectionId]
    );

    const tasks = [...noDueTasks, ...serviceTasks].sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );

    const stats = {
      totalTasks: tasks.length,

      pendingTasks: tasks.filter(
        (task) => task.status === "PENDING"
      ).length,

      underReviewTasks: tasks.filter(
        (task) => task.status === "UNDER_REVIEW"
      ).length,

      approvedTasks: tasks.filter(
        (task) => task.status === "APPROVED"
      ).length,

      correctionTasks: tasks.filter(
        (task) => task.status === "CORRECTION_REQUIRED"
      ).length,

      rejectedTasks: tasks.filter(
        (task) => task.status === "REJECTED"
      ).length,
    };

    return res.json({
      success: true,
      staff: getStaffInfo(staffSection),
      stats,
      tasks,
    });
  } catch (error) {
    console.error("Get staff dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load staff dashboard",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| GET STAFF TASK DETAILS
|--------------------------------------------------------------------------
|
| Supports:
| ND-<id> : No-Due clearance task
| SR-<id> : Regular service review
|
*/

const getStaffTaskDetails = async (req, res) => {
  try {
    const parsedTask = parseTaskId(req.params.taskId);
    const staffSection = req.staffSection;

    if (!staffSection) {
      return res.status(403).json({
        success: false,
        message: "Staff section information is required",
      });
    }

    if (!parsedTask) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. Expected ND-123 or SR-123.",
      });
    }

    const { type, id: taskId } = parsedTask;
    const sectionId = staffSection.sectionId;

    /*
     * 1. Fetch task, request and student.
     * Use the appropriate table based on the task prefix.
     */

    let taskRows;

    if (type === "ND") {
      [taskRows] = await pool.query(
        `
        SELECT
          ct.id,
          'NO_DUE' AS taskType,

          ct.no_due_request_id AS noDueRequestId,
          ct.workflow_step_id AS workflowStepId,
          ct.section_id AS sectionId,
          ct.assigned_to AS assignedTo,

          ct.status,
          ct.is_required AS isRequired,
          ct.remarks,
          ct.correction_reason AS correctionReason,
          ct.started_at AS startedAt,
          ct.completed_at AS completedAt,
          ct.created_at AS createdAt,
          ct.updated_at AS updatedAt,

          r.id AS requestId,
          r.request_number AS requestNumber,
          r.status AS requestStatus,
          r.current_step AS currentStep,
          r.submitted_at AS submittedAt,
          r.completed_at AS requestCompletedAt,
          r.created_at AS requestCreatedAt,
          r.updated_at AS requestUpdatedAt,

          u.id AS studentUserId,
          u.name AS studentName,
          u.email AS studentEmail,
          u.phone AS studentPhone,

          s.id AS studentId,
          s.roll_number AS rollNumber,
          s.registration_number AS registrationNumber,
          s.batch,
          s.hostel_status AS hostelStatus,
          s.father_name AS fatherName,
          s.mother_name AS motherName,
          s.gender,
          s.category,
          s.date_of_birth AS dateOfBirth,
          s.address,
          s.aadhaar_number AS aadhaarNumber,
          s.current_semester AS currentSemester,
          s.academic_year AS academicYear,
          s.admission_year AS admissionYear,
          s.passing_year AS passingYear,

          d.id AS departmentId,
          d.code AS departmentCode,
          d.name AS departmentName,

          dt.id AS documentTypeId,
          dt.code AS documentCode,
          dt.name AS documentName,
          dt.description AS documentDescription,

          sec.id AS taskSectionId,
          sec.code AS sectionCode,
          sec.name AS sectionName

        FROM clearance_tasks ct

        INNER JOIN no_due_requests nd
          ON nd.id = ct.no_due_request_id

        INNER JOIN requests r
          ON r.id = nd.request_id

        INNER JOIN students s
          ON s.id = r.student_id

        INNER JOIN users u
          ON u.id = s.user_id

        INNER JOIN departments d
          ON d.id = s.department_id

        INNER JOIN document_types dt
          ON dt.id = r.document_type_id

        INNER JOIN sections sec
          ON sec.id = ct.section_id

        WHERE ct.id = ?
          AND ct.section_id = ?
          AND dt.code = 'NO_DUE'

        LIMIT 1
        `,
        [taskId, sectionId]
      );
    } else {
      [taskRows] = await pool.query(
        `
        SELECT
          sr.id,
          'SERVICE' AS taskType,

          NULL AS noDueRequestId,
          NULL AS workflowStepId,
          sr.section_id AS sectionId,
          sr.assigned_to AS assignedTo,

          sr.status,
          1 AS isRequired,
          sr.remarks,
          sr.correction_reason AS correctionReason,
          sr.started_at AS startedAt,
          sr.completed_at AS completedAt,
          sr.created_at AS createdAt,
          sr.updated_at AS updatedAt,

          r.id AS requestId,
          r.request_number AS requestNumber,
          r.status AS requestStatus,
          r.current_step AS currentStep,
          r.submitted_at AS submittedAt,
          r.completed_at AS requestCompletedAt,
          r.created_at AS requestCreatedAt,
          r.updated_at AS requestUpdatedAt,

          u.id AS studentUserId,
          u.name AS studentName,
          u.email AS studentEmail,
          u.phone AS studentPhone,

          s.id AS studentId,
          s.roll_number AS rollNumber,
          s.registration_number AS registrationNumber,
          s.batch,
          s.hostel_status AS hostelStatus,
          s.father_name AS fatherName,
          s.mother_name AS motherName,
          s.gender,
          s.category,
          s.date_of_birth AS dateOfBirth,
          s.address,
          s.aadhaar_number AS aadhaarNumber,
          s.current_semester AS currentSemester,
          s.academic_year AS academicYear,
          s.admission_year AS admissionYear,
          s.passing_year AS passingYear,

          d.id AS departmentId,
          d.code AS departmentCode,
          d.name AS departmentName,

          dt.id AS documentTypeId,
          dt.code AS documentCode,
          dt.name AS documentName,
          dt.description AS documentDescription,

          sec.id AS taskSectionId,
          sec.code AS sectionCode,
          sec.name AS sectionName

        FROM request_staff_reviews sr

        INNER JOIN requests r
          ON r.id = sr.request_id

        INNER JOIN students s
          ON s.id = r.student_id

        INNER JOIN users u
          ON u.id = s.user_id

        INNER JOIN departments d
          ON d.id = s.department_id

        INNER JOIN document_types dt
          ON dt.id = r.document_type_id

        INNER JOIN sections sec
          ON sec.id = sr.section_id

        WHERE sr.id = ?
          AND sr.section_id = ?

        LIMIT 1
        `,
        [taskId, sectionId]
      );
    }

    if (taskRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found or access denied",
      });
    }

    const task = taskRows[0];

    /*
     * 2. Application data
     */

    const [applicationRows] = await pool.query(
      `
      SELECT
        id,
        request_id,
        application_data,
        created_at,
        updated_at

      FROM request_application_data

      WHERE request_id = ?

      LIMIT 1
      `,
      [task.requestId]
    );

    const applicationData =
      applicationRows.length > 0
        ? parseApplicationData(
            applicationRows[0].application_data
          )
        : null;

    /*
     * 3. Configured document requirements
     */

    const [requiredDocuments] = await pool.query(
      `
      SELECT
        dr.id AS requirementId,
        dr.document_code AS documentCode,
        dr.document_name AS documentName,
        dr.description,
        dr.allowed_file_types AS allowedFileTypes,
        dr.max_file_size_mb AS maxFileSizeMb,

        sdr.is_required AS isRequired,
        sdr.display_order AS displayOrder

      FROM service_document_requirements sdr

      INNER JOIN document_requirements dr
        ON dr.id = sdr.document_requirement_id

      WHERE sdr.document_type_id = ?
        AND dr.is_active = 1

      ORDER BY sdr.display_order ASC, dr.id ASC
      `,
      [task.documentTypeId]
    );

    /*
     * 4. Uploaded documents
     */

    const [documents] = await pool.query(
      `
      SELECT
        rd.id,
        rd.request_id AS requestId,
        rd.document_requirement_id AS documentRequirementId,

        dr.document_code AS documentCode,
        dr.document_name AS documentName,
        dr.description AS documentDescription,

        rd.uploaded_by AS uploadedBy,
        rd.original_name AS originalName,
        rd.stored_name AS storedName,
        rd.file_path AS filePath,
        rd.mime_type AS mimeType,
        rd.file_size AS fileSize,
        rd.document_type AS documentType,
        rd.version,
        rd.created_at AS createdAt

      FROM request_documents rd

      LEFT JOIN document_requirements dr
        ON dr.id = rd.document_requirement_id

      WHERE rd.request_id = ?

      ORDER BY
        rd.document_requirement_id ASC,
        rd.version DESC,
        rd.created_at DESC
      `,
      [task.requestId]
    );

    /*
     * Latest uploaded version for each configured requirement.
     */

    const documentMap = new Map();

    for (const document of documents) {
      const requirementId =
        document.documentRequirementId;

      if (
        requirementId !== null &&
        !documentMap.has(requirementId)
      ) {
        documentMap.set(requirementId, document);
      }
    }

    const documentReview = requiredDocuments.map(
      (requirement) => ({
        requirement: {
          id: requirement.requirementId,
          code: requirement.documentCode,
          name: requirement.documentName,
          description: requirement.description,
          allowedFileTypes: requirement.allowedFileTypes,
          maxFileSizeMb: requirement.maxFileSizeMb,
          isRequired: Boolean(requirement.isRequired),
          displayOrder: requirement.displayOrder,
        },

        uploadedDocument:
          documentMap.get(requirement.requirementId) || null,
      })
    );

    /*
     * 5. Delivery
     */

    const [deliveryRows] = await pool.query(
      `
      SELECT
        id,
        request_id AS requestId,
        delivery_type AS deliveryType,
        postal_fee AS postalFee,
        payment_status AS paymentStatus,
        payment_id AS paymentId,
        recipient_name AS recipientName,
        address_line1 AS addressLine1,
        address_line2 AS addressLine2,
        city,
        district,
        state,
        pincode,
        mobile,
        delivery_status AS deliveryStatus,
        courier_name AS courierName,
        tracking_number AS trackingNumber,
        dispatched_at AS dispatchedAt,
        delivered_at AS deliveredAt

      FROM request_deliveries

      WHERE request_id = ?

      LIMIT 1
      `,
      [task.requestId]
    );

    /*
     * 6. Payments
     */

    const [paymentRows] = await pool.query(
      `
      SELECT
        id,
        request_id AS requestId,
        payment_type AS paymentType,
        amount,
        gateway,
        payment_mode AS paymentMode,
        transaction_id AS transactionId,
        status,
        paid_at AS paidAt,
        created_at AS createdAt

      FROM payments

      WHERE request_id = ?

      ORDER BY id DESC
      `,
      [task.requestId]
    );

    /*
     * 7. No-Due clearance tasks.
     * Regular service requests have no clearance tasks.
     */

    let clearanceTasks = [];
    let noDue = null;

    if (type === "ND") {
      const [clearanceRows] = await pool.query(
        `
        SELECT
          ct.id,
          ct.no_due_request_id AS noDueRequestId,
          ct.workflow_step_id AS workflowStepId,
          ct.section_id AS sectionId,
          ct.assigned_to AS assignedTo,

          ct.status,
          ct.is_required AS isRequired,
          ct.remarks,
          ct.correction_reason AS correctionReason,
          ct.started_at AS startedAt,
          ct.completed_at AS completedAt,
          ct.created_at AS createdAt,
          ct.updated_at AS updatedAt,

          sec.code AS sectionCode,
          sec.name AS sectionName

        FROM clearance_tasks ct

        INNER JOIN sections sec
          ON sec.id = ct.section_id

        WHERE ct.no_due_request_id = ?

        ORDER BY ct.id ASC
        `,
        [task.noDueRequestId]
      );

      clearanceTasks = clearanceRows;

      const [noDueRows] = await pool.query(
        `
        SELECT
          id,
          request_id AS requestId,
          overall_status AS overallStatus,
          total_tasks AS totalTasks,
          completed_tasks AS completedTasks,
          pending_tasks AS pendingTasks,
          correction_tasks AS correctionTasks,
          rejected_tasks AS rejectedTasks,
          created_at AS createdAt,
          updated_at AS updatedAt

        FROM no_due_requests

        WHERE id = ?

        LIMIT 1
        `,
        [task.noDueRequestId]
      );

      noDue =
        noDueRows.length > 0
          ? noDueRows[0]
          : null;
    }

    /*
     * 8. Status history
     */

    const [statusHistory] = await pool.query(
      `
      SELECT
        h.id,
        h.request_id AS requestId,
        h.changed_by AS changedBy,
        h.old_status AS oldStatus,
        h.new_status AS newStatus,
        h.remarks,
        h.created_at AS createdAt,

        u.name AS changedByName,
        u.email AS changedByEmail

      FROM request_status_history h

      LEFT JOIN users u
        ON u.id = h.changed_by

      WHERE h.request_id = ?

      ORDER BY h.created_at ASC, h.id ASC
      `,
      [task.requestId]
    );

    /*
     * 9. Return the response in the format expected
     *    by StaffTaskDetails.jsx.
     */

    return res.json({
      success: true,

      task: {
        id: task.id,
        taskType: task.taskType,

        noDueRequestId: task.noDueRequestId,
        workflowStepId: task.workflowStepId,
        sectionId: task.sectionId,
        assignedTo: task.assignedTo,

        status: task.status,
        isRequired: Boolean(task.isRequired),
        remarks: task.remarks,
        correctionReason: task.correctionReason,

        startedAt: task.startedAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,

        section: {
          id: task.taskSectionId,
          code: task.sectionCode,
          name: task.sectionName,
        },
      },

      request: {
        id: task.requestId,
        requestNumber: task.requestNumber,
        status: task.requestStatus,
        currentStep: task.currentStep,
        submittedAt: task.submittedAt,
        completedAt: task.requestCompletedAt,
        createdAt: task.requestCreatedAt,
        updatedAt: task.requestUpdatedAt,

        documentType: {
          id: task.documentTypeId,
          code: task.documentCode,
          name: task.documentName,
          description: task.documentDescription,
        },
      },

      student: {
        id: task.studentId,
        userId: task.studentUserId,

        name: task.studentName,
        email: task.studentEmail,
        phone: task.studentPhone,

        fatherName: task.fatherName,
        motherName: task.motherName,

        rollNumber: task.rollNumber,
        registrationNumber: task.registrationNumber,
        batch: task.batch,

        currentSemester: task.currentSemester,
        academicYear: task.academicYear,
        admissionYear: task.admissionYear,
        passingYear: task.passingYear,

        hostelStatus: task.hostelStatus,
        gender: task.gender,
        category: task.category,
        dateOfBirth: task.dateOfBirth,
        address: task.address,
        aadhaarNumber: task.aadhaarNumber,

        department: {
          id: task.departmentId,
          code: task.departmentCode,
          name: task.departmentName,
        },
      },

      applicationData,
      documentReview,
      documents,

      delivery:
        deliveryRows.length > 0
          ? deliveryRows[0]
          : null,

      payments: paymentRows,
      noDue,
      clearanceTasks,
      statusHistory,
    });
  } catch (error) {
    console.error("Get staff task details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load staff task details",
      error: error.message,
    });
  }
};

/*
|--------------------------------------------------------------------------
| REVIEW STAFF TASK
|--------------------------------------------------------------------------
|
| ND-<id> -> existing No-Due clearance review
| SR-<id> -> regular document service review
|
*/

const reviewStaffTask = async (req, res) => {
  const staffSection = req.staffSection;

  if (!staffSection) {
    return res.status(403).json({
      success: false,
      message: "Staff section information is required",
    });
  }

  const parsedTask = parseTaskId(req.params.taskId);

  if (!parsedTask) {
    return res.status(400).json({
      success: false,
      message: "Invalid task ID. Expected ND-123 or SR-123.",
    });
  }

  const { type, id: taskId } = parsedTask;

  const staffUserId = staffSection.userId;
  const sectionId = staffSection.sectionId;

  const normalizedAction = String(
    req.body.action || ""
  )
    .trim()
    .toUpperCase();

  const allowedActions = [
    "APPROVE",
    "CORRECTION_REQUIRED",
    "REJECT",
  ];

  if (!allowedActions.includes(normalizedAction)) {
    return res.status(400).json({
      success: false,
      message:
        "Invalid action. Use APPROVE, CORRECTION_REQUIRED, or REJECT.",
    });
  }

  const cleanRemarks =
    typeof req.body.remarks === "string"
      ? req.body.remarks.trim()
      : "";

  if (
    ["CORRECTION_REQUIRED", "REJECT"].includes(
      normalizedAction
    ) &&
    !cleanRemarks
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Remarks are required for correction or rejection",
    });
  }

  const newTaskStatus = getNewStatus(normalizedAction);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * =========================================================
     * A. REGULAR SERVICE REVIEW
     * =========================================================
     */

    if (type === "SR") {
      /*
       * 1. Lock review row and validate staff section.
       */

      const [reviewRows] = await connection.query(
        `
        SELECT
          sr.id,
          sr.request_id AS requestId,
          sr.section_id AS sectionId,
          sr.assigned_to AS assignedTo,
          sr.status,

          r.status AS requestStatus,
          r.document_type_id AS documentTypeId,
          dt.code AS documentCode,
          dt.name AS documentName

        FROM request_staff_reviews sr

        INNER JOIN requests r
          ON r.id = sr.request_id

        INNER JOIN document_types dt
          ON dt.id = r.document_type_id

        WHERE sr.id = ?
          AND sr.section_id = ?

        LIMIT 1

        FOR UPDATE
        `,
        [taskId, sectionId]
      );

      if (reviewRows.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          success: false,
          message: "Task not found or access denied",
        });
      }

      const review = reviewRows[0];

      /*
       * A staff member may review only their assigned section.
       * This also prevents No-Due requests from being reviewed
       * through the regular service endpoint.
       */

      if (!isReviewable(review.status)) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message:
            `This task cannot be reviewed because its current status is ${review.status}`,
        });
      }

      /*
       * 2. Update the regular service review.
       */

      await connection.query(
        `
        UPDATE request_staff_reviews

        SET
          assigned_to = ?,
          status = ?,
          remarks = ?,
          correction_reason = ?,

          started_at = COALESCE(started_at, NOW()),

          completed_at = ?,

          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
          AND section_id = ?
        `,
        [
          staffUserId,
          newTaskStatus,
          cleanRemarks || null,

          normalizedAction === "CORRECTION_REQUIRED"
            ? cleanRemarks
            : null,

          ["APPROVE", "REJECT"].includes(
            normalizedAction
          )
            ? new Date()
            : null,

          taskId,
          sectionId,
        ]
      );

      /*
       * 3. Determine the main request status.
       *
       * Each regular service request has one assigned
       * staff review (Examination or Establishment).
       */

      let requestStatus;

      if (normalizedAction === "APPROVE") {
        requestStatus = "APPROVED";
      } else if (
        normalizedAction === "CORRECTION_REQUIRED"
      ) {
        requestStatus = "CORRECTION_REQUIRED";
      } else {
        requestStatus = "REJECTED";
      }

      /*
       * 4. Update the main request.
       */

      await connection.query(
        `
        UPDATE requests

        SET
          status = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
        `,
        [requestStatus, review.requestId]
      );

      /*
       * 5. Add request status history.
       */

      const historyRemarks =
        cleanRemarks ||
        (
          normalizedAction === "APPROVE"
            ? `${review.documentName} application approved by ${staffSection.sectionName}`
            : `${review.documentName} application processed by ${staffSection.sectionName}`
        );

      await connection.query(
        `
        INSERT INTO request_status_history (
          request_id,
          changed_by,
          old_status,
          new_status,
          remarks
        )

        VALUES (?, ?, ?, ?, ?)
        `,
        [
          review.requestId,
          staffUserId,
          review.requestStatus,
          requestStatus,
          historyRemarks,
        ]
      );

      await connection.commit();

      let message;

      if (normalizedAction === "APPROVE") {
        message =
          `${review.documentName} application approved successfully`;
      } else if (
        normalizedAction === "CORRECTION_REQUIRED"
      ) {
        message =
          `Correction requested for ${review.documentName} application`;
      } else {
        message =
          `${review.documentName} application rejected successfully`;
      }

      return res.json({
        success: true,
        message,

        review: {
          taskId: `SR-${taskId}`,
          taskType: "SERVICE",
          requestId: review.requestId,
          documentCode: review.documentCode,
          action: normalizedAction,
          taskStatus: newTaskStatus,
          requestStatus,
          remarks: cleanRemarks || null,
        },
      });
    }

    /*
     * =========================================================
     * B. NO-DUE CLEARANCE REVIEW
     * =========================================================
     */

    /*
     * 1. Fetch No-Due task and validate section.
     */

    const [taskRows] = await connection.query(
      `
      SELECT
        ct.id,
        ct.no_due_request_id AS noDueRequestId,
        ct.section_id AS sectionId,
        ct.status,
        ct.is_required AS isRequired,

        nd.request_id AS requestId,

        r.status AS requestStatus,
        r.student_id AS studentId,

        dt.code AS documentCode

      FROM clearance_tasks ct

      INNER JOIN no_due_requests nd
        ON nd.id = ct.no_due_request_id

      INNER JOIN requests r
        ON r.id = nd.request_id

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      WHERE ct.id = ?
        AND ct.section_id = ?

      LIMIT 1

      FOR UPDATE
      `,
      [taskId, sectionId]
    );

    if (taskRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Task not found or access denied",
      });
    }

    const task = taskRows[0];

    if (task.documentCode !== "NO_DUE") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "This task is not part of the No-Due workflow.",
      });
    }

    if (!isReviewable(task.status)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          `This task cannot be reviewed because its current status is ${task.status}`,
      });
    }

    /*
     * 2. Update clearance task.
     */

    await connection.query(
      `
      UPDATE clearance_tasks

      SET
        assigned_to = ?,
        status = ?,
        remarks = ?,
        correction_reason = ?,

        started_at = COALESCE(started_at, NOW()),

        completed_at = ?,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
        AND section_id = ?
      `,
      [
        staffUserId,
        newTaskStatus,
        cleanRemarks || null,

        normalizedAction === "CORRECTION_REQUIRED"
          ? cleanRemarks
          : null,

        ["APPROVE", "REJECT"].includes(
          normalizedAction
        )
          ? new Date()
          : null,

        taskId,
        sectionId,
      ]
    );

    /*
     * 3. Update immediate request status.
     */

    let immediateRequestStatus;

    if (normalizedAction === "CORRECTION_REQUIRED") {
      immediateRequestStatus = "CORRECTION_REQUIRED";
    } else if (normalizedAction === "REJECT") {
      immediateRequestStatus = "REJECTED";
    } else {
      immediateRequestStatus = "CLEARANCE_IN_PROGRESS";
    }

    await connection.query(
      `
      UPDATE requests

      SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [immediateRequestStatus, task.requestId]
    );

    /*
     * 4. Add status history.
     */

    const historyRemarks =
      cleanRemarks ||
      (
        normalizedAction === "APPROVE"
          ? "No-Due clearance task approved by staff"
          : "No-Due clearance task processed by staff"
      );

    await connection.query(
      `
      INSERT INTO request_status_history (
        request_id,
        changed_by,
        old_status,
        new_status,
        remarks
      )

      VALUES (?, ?, ?, ?, ?)
      `,
      [
        task.requestId,
        staffUserId,
        task.requestStatus,
        immediateRequestStatus,
        historyRemarks,
      ]
    );

    /*
     * 5. Recalculate required clearance tasks.
     */

    const [statsRows] = await connection.query(
      `
      SELECT
        COUNT(*) AS total_tasks,

        SUM(
          CASE
            WHEN status = 'APPROVED'
            THEN 1
            ELSE 0
          END
        ) AS completed_tasks,

        SUM(
          CASE
            WHEN status IN (
              'PENDING',
              'UNDER_REVIEW',
              'RESUBMITTED'
            )
            THEN 1
            ELSE 0
          END
        ) AS pending_tasks,

        SUM(
          CASE
            WHEN status = 'CORRECTION_REQUIRED'
            THEN 1
            ELSE 0
          END
        ) AS correction_tasks,

        SUM(
          CASE
            WHEN status = 'REJECTED'
            THEN 1
            ELSE 0
          END
        ) AS rejected_tasks

      FROM clearance_tasks

      WHERE no_due_request_id = ?
        AND is_required = 1
      `,
      [task.noDueRequestId]
    );

    const taskStats = statsRows[0] || {};

    const totalTasks = Number(
      taskStats.total_tasks || 0
    );

    const completedTasks = Number(
      taskStats.completed_tasks || 0
    );

    const pendingTasks = Number(
      taskStats.pending_tasks || 0
    );

    const correctionTasks = Number(
      taskStats.correction_tasks || 0
    );

    const rejectedTasks = Number(
      taskStats.rejected_tasks || 0
    );

    /*
     * 6. Calculate overall No-Due status.
     */

    let overallStatus = "CLEARANCE_IN_PROGRESS";

    if (rejectedTasks > 0) {
      overallStatus = "REJECTED";
    } else if (correctionTasks > 0) {
      overallStatus = "CORRECTION_REQUIRED";
    } else if (
      totalTasks > 0 &&
      completedTasks === totalTasks
    ) {
      overallStatus = "ALL_CLEARANCES_COMPLETED";
    }

    /*
     * 7. Update No-Due summary.
     */

    await connection.query(
      `
      UPDATE no_due_requests

      SET
        overall_status = ?,
        total_tasks = ?,
        completed_tasks = ?,
        pending_tasks = ?,
        correction_tasks = ?,
        rejected_tasks = ?,
        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
      [
        overallStatus,
        totalTasks,
        completedTasks,
        pendingTasks,
        correctionTasks,
        rejectedTasks,
        task.noDueRequestId,
      ]
    );

    /*
     * 8. If all required clearances are approved,
     *    update the main No-Due request.
     */

    if (overallStatus === "ALL_CLEARANCES_COMPLETED") {
      await connection.query(
        `
        UPDATE requests

        SET
          status = 'ALL_CLEARANCES_COMPLETED',
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
          AND status <> 'REJECTED'
        `,
        [task.requestId]
      );

      await connection.query(
        `
        INSERT INTO request_status_history (
          request_id,
          changed_by,
          old_status,
          new_status,
          remarks
        )

        VALUES (?, ?, ?, ?, ?)
        `,
        [
          task.requestId,
          staffUserId,
          immediateRequestStatus,
          "ALL_CLEARANCES_COMPLETED",
          "All required No-Due clearance sections approved",
        ]
      );
    }

    await connection.commit();

    let message;

    if (normalizedAction === "APPROVE") {
      message =
        "No-Due clearance task approved successfully";
    } else if (
      normalizedAction === "CORRECTION_REQUIRED"
    ) {
      message =
        "No-Due correction requested successfully";
    } else {
      message =
        "No-Due clearance task rejected successfully";
    }

    return res.json({
      success: true,
      message,

      review: {
        taskId: `ND-${taskId}`,
        taskType: "NO_DUE",
        action: normalizedAction,
        taskStatus: newTaskStatus,

        requestStatus:
          overallStatus === "ALL_CLEARANCES_COMPLETED"
            ? "ALL_CLEARANCES_COMPLETED"
            : immediateRequestStatus,

        noDueStatus: overallStatus,
        remarks: cleanRemarks || null,
      },

      statistics: {
        totalTasks,
        completedTasks,
        pendingTasks,
        correctionTasks,
        rejectedTasks,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError);
    }

    console.error("Review staff task error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process staff review",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

/*
|--------------------------------------------------------------------------
| VIEW / DOWNLOAD STAFF DOCUMENT
|--------------------------------------------------------------------------
|
| Staff can open a document only when its request
| belongs to their authorized section.
|
*/

const viewStaffDocument = async (req, res) => {
  try {
    const staffSection = req.staffSection;

    if (!staffSection) {
      return res.status(403).json({
        success: false,
        message: "Staff section information is required",
      });
    }

    const documentId = Number(req.params.documentId);

    if (
      !Number.isSafeInteger(documentId) ||
      documentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID",
      });
    }

    const sectionId = staffSection.sectionId;

    /*
     * Find the document only if the logged-in
     * staff member's section has access to it.
     *
     * Access can come from:
     * 1. A No-Due clearance task
     * 2. A regular service review
     */

    const [rows] = await pool.query(
      `
      SELECT
        rd.id,
        rd.original_name AS originalName,
        rd.stored_name AS storedName,
        rd.file_path AS filePath,
        rd.mime_type AS mimeType,
        rd.request_id AS requestId

      FROM request_documents rd

      INNER JOIN requests r
        ON r.id = rd.request_id

      WHERE rd.id = ?

        AND (
          EXISTS (
            SELECT 1

            FROM request_staff_reviews sr

            WHERE sr.request_id = r.id
              AND sr.section_id = ?
          )

          OR EXISTS (
            SELECT 1

            FROM no_due_requests nd

            INNER JOIN clearance_tasks ct
              ON ct.no_due_request_id = nd.id

            WHERE nd.request_id = r.id
              AND ct.section_id = ?
          )
        )

      LIMIT 1
      `,
      [
        documentId,
        sectionId,
        sectionId,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Document not found or access denied",
      });
    }

    const document = rows[0];

    /*
     * Database paths are relative to the server
     * directory, for example:
     *
     * uploads\requests\11\documents-123.pdf
     *
     * Normalize Windows backslashes and resolve
     * the path safely.
     */

    const relativePath = String(
      document.filePath || ""
    ).replace(/\\/g, "/");

    const uploadsRoot = path.resolve(
      process.cwd(),
      "uploads"
    );

    const absolutePath = path.resolve(
      process.cwd(),
      relativePath
    );

    /*
     * Prevent directory traversal and ensure
     * the resolved path remains inside uploads.
     */

    if (
      !absolutePath.startsWith(
        uploadsRoot + path.sep
      )
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid document storage path",
      });
    }

    if (!fs.existsSync(absolutePath)) {
      console.error(
        "Staff document file missing:",
        absolutePath
      );

      return res.status(404).json({
        success: false,
        message:
          "The uploaded file could not be found on the server",
      });
    }

    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    const mimeType = String(
      document.mimeType || ""
    ).toLowerCase();

    if (!allowedMimeTypes.includes(mimeType)) {
      return res.status(415).json({
        success: false,
        message: "Unsupported document file type",
      });
    }

    /*
     * Open PDFs and images in the browser.
     */

    const safeFileName = String(
      document.originalName || "document"
    ).replace(/["\\\r\n]/g, "_");

    res.setHeader(
      "Content-Type",
      mimeType
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeFileName}"`
    );

    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.setHeader(
      "Cache-Control",
      "private, no-store"
    );

    return res.sendFile(
      absolutePath,
      (error) => {
        if (error && !res.headersSent) {
          console.error(
            "Document serving error:",
            error
          );

          res.status(500).json({
            success: false,
            message: "Unable to open document",
          });
        }
      }
    );
  } catch (error) {
    console.error(
      "View staff document error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to open staff document",
    });
  }
};

const uploadStaffProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Choose a JPG, PNG or WEBP photo (maximum 2 MB)." });
    const relative = `uploads/profile-photos/${req.file.filename}`;
    await pool.query("UPDATE users SET profile_photo_path = ? WHERE id = ?", [relative, req.user.userId]);
    return res.json({ success: true, profilePhotoUrl: `/uploads/profile-photos/${req.file.filename}` });
  } catch (error) {
    console.error("Staff profile photo upload error:", error);
    return res.status(500).json({ success: false, message: "Unable to save profile photo." });
  }
};

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getStaffDashboard,
  getStaffTaskDetails,
  reviewStaffTask,
  viewStaffDocument,
  uploadStaffProfilePhoto,
};