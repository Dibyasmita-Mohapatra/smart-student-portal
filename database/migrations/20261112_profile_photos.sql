USE smart_student_portal;

-- Run once. Shared by student and staff accounts.
ALTER TABLE users
  ADD COLUMN profile_photo_path VARCHAR(255) NULL;
