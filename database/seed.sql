-- ============================================================
-- SMART STUDENT DOCUMENT & ACADEMIC CLEARANCE PORTAL
-- INITIAL SEED DATA
-- ============================================================

USE smart_student_portal;


-- ============================================================
-- 1. ROLES
-- ============================================================

INSERT INTO roles (name, description) VALUES
                                          ('STUDENT', 'Student using the academic services portal'),
                                          ('HOD', 'Head of Department'),
                                          ('SECTION_STAFF', 'Staff member responsible for a college section'),
                                          ('ADMIN', 'System administrator');


-- ============================================================
-- 2. DEPARTMENTS
-- ============================================================

INSERT INTO departments (name, code) VALUES
                                         ('Computer Science and Engineering', 'CSE'),
                                         ('Civil Engineering', 'CIVIL'),
                                         ('Electrical Engineering', 'EE'),
                                         ('Mining Engineering', 'MINING'),
                                         ('Mechanical Engineering', 'MECH'),
                                         ('Metallurgy Engineering', 'METALLURGY'),
                                         ('Mineral Engineering', 'MINERAL');


-- ============================================================
-- 3. SECTIONS
-- ============================================================

-- HOD sections
INSERT INTO sections
(name, code, description, department_id)
SELECT
    'CSE HOD',
    'HOD_CSE',
    'Head of Department - Computer Science and Engineering',
    id
FROM departments
WHERE code = 'CSE';

INSERT INTO sections
(name, code, description, department_id)
SELECT
    'Civil HOD',
    'HOD_CIVIL',
    'Head of Department - Civil Engineering',
    id
FROM departments
WHERE code = 'CIVIL';

INSERT INTO sections
(name, code, description, department_id)
SELECT
    'Electrical HOD',
    'HOD_EE',
    'Head of Department - Electrical Engineering',
    id
FROM departments
WHERE code = 'EE';

INSERT INTO sections
(name, code, description, department_id)
SELECT
    'Mining HOD',
    'HOD_MINING',
    'Head of Department - Mining Engineering',
    id
FROM departments
WHERE code = 'MINING';

INSERT INTO sections
(name, code, description, department_id)
SELECT
    'Mechanical HOD',
    'HOD_MECH',
    'Head of Department - Mechanical Engineering',
    id
FROM departments
WHERE code = 'MECH';

INSERT INTO sections
(name, code, description, department_id)
SELECT
    'Metallurgy HOD',
    'HOD_METALLURGY',
    'Head of Department - Metallurgy Engineering',
    id
FROM departments
WHERE code = 'METALLURGY';

INSERT INTO sections
(name, code, description, department_id)
SELECT
    'Mineral HOD',
    'HOD_MINERAL',
    'Head of Department - Mineral Engineering',
    id
FROM departments
WHERE code = 'MINERAL';


-- General college sections

INSERT INTO sections (name, code, description) VALUES
                                                   ('Examination Section',
                                                    'EXAMINATION',
                                                    'Handles examination and academic record related clearance'),

                                                   ('Establishment Section',
                                                    'ESTABLISHMENT',
                                                    'Handles establishment and administrative clearance'),

                                                   ('Accounts Section',
                                                    'ACCOUNTS',
                                                    'Handles financial clearance'),

                                                   ('Library Section',
                                                    'LIBRARY',
                                                    'Handles library clearance'),

                                                   ('Warden - Boys',
                                                    'WARDEN_BOYS',
                                                    'Handles hostel clearance for boys'),

                                                   ('Warden - Girls',
                                                    'WARDEN_GIRLS',
                                                    'Handles hostel clearance for girls'),

                                                   ('Transport Section',
                                                    'TRANSPORT',
                                                    'Handles transport related clearance'),

                                                   ('Cultural Section',
                                                    'CULTURAL',
                                                    'Handles cultural activities related clearance'),

                                                   ('Sports Section',
                                                    'SPORTS',
                                                    'Handles sports related clearance'),

                                                   ('Discipline Section',
                                                    'DISCIPLINE',
                                                    'Handles discipline related clearance'),

                                                   ('Training and Placement Section',
                                                    'TRAINING_PLACEMENT',
                                                    'Handles training and placement related clearance');


-- ============================================================
-- 4. DOCUMENT / SERVICE TYPES
-- ============================================================

INSERT INTO document_types
(name, code, description, category, requires_supporting_document)
VALUES

    (
        'No-Due Clearance',
        'NO_DUE',
        'Digital academic and administrative no-due clearance from required college sections.',
        'CLEARANCE',
        FALSE
    ),

    (
        'Final Certificate',
        'FINAL_CERTIFICATE',
        'Final certificate issued after completion of required academic and administrative processes.',
        'CERTIFICATE',
        FALSE
    ),

    (
        'Provisional Certificate',
        'PROVISIONAL_CERTIFICATE',
        'Provisional certificate for students completing their academic programme.',
        'CERTIFICATE',
        FALSE
    ),

    (
        'Grade Sheet Certificate',
        'GRADE_SHEET',
        'Official grade sheet or grade sheet certificate.',
        'DOCUMENT',
        FALSE
    ),

    (
        'Conduct Certificate',
        'CONDUCT_CERTIFICATE',
        'Certificate confirming the conduct of the student during their period of study.',
        'CERTIFICATE',
        FALSE
    ),

    (
        'College Leaving Certificate',
        'CLC',
        'College Leaving Certificate issued to an eligible student.',
        'CERTIFICATE',
        FALSE
    ),

    (
        'Caution Money',
        'CAUTION_MONEY',
        'Caution money related request and processing.',
        'FINANCIAL',
        FALSE
    );


-- ============================================================
-- 5. NO-DUE WORKFLOW
-- ============================================================

INSERT INTO workflow_definitions
(document_type_id, name, description, version, is_active)
SELECT
    id,
    'Standard No-Due Clearance Workflow',
    'Clearance workflow for academic and administrative no-due processing.',
    1,
    TRUE
FROM document_types
WHERE code = 'NO_DUE';


-- ============================================================
-- 6. NO-DUE WORKFLOW STEPS
-- ============================================================

-- CSE HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_CSE'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Civil HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_CIVIL'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Electrical HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_EE'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Mining HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_MINING'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Mechanical HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_MECH'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Metallurgy HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_METALLURGY'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Mineral HOD
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    1,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'HOD_MINERAL'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Examination
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    2,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'EXAMINATION'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Establishment
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    3,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'ESTABLISHMENT'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Accounts
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    4,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'ACCOUNTS'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Library
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    5,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'LIBRARY'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Boys Warden - conditional
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    6,
    TRUE,
    'HOSTELLER_ONLY'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'WARDEN_BOYS'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Girls Warden - conditional
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    7,
    TRUE,
    'HOSTELLER_ONLY'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'WARDEN_GIRLS'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Transport
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    8,
    FALSE,
    'CONDITIONAL'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'TRANSPORT'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Cultural
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    9,
    FALSE,
    'CONDITIONAL'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'CULTURAL'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Sports
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    10,
    FALSE,
    'CONDITIONAL'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'SPORTS'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Discipline
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    11,
    TRUE,
    'ALWAYS'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'DISCIPLINE'
WHERE w.name = 'Standard No-Due Clearance Workflow';


-- Training & Placement
INSERT INTO workflow_steps
(workflow_id, section_id, step_order, is_required, condition_type)
SELECT
    w.id,
    s.id,
    12,
    FALSE,
    'CONDITIONAL'
FROM workflow_definitions w
         JOIN sections s ON s.code = 'TRAINING_PLACEMENT'
WHERE w.name = 'Standard No-Due Clearance Workflow';