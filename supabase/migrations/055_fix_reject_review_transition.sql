-- Migration 055: Fix missing Done -> Work-In-Progress transition
-- The validate_task_status_transition function was missing the Done -> Work-In-Progress
-- transition, which blocked Super Admins from rejecting reviews and requesting changes.

CREATE OR REPLACE FUNCTION public.validate_task_status_transition(
  p_old_status VARCHAR(50),
  p_new_status VARCHAR(50),
  p_user_role VARCHAR(50)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Super Admin can reopen Closed tasks
  IF p_old_status = 'Closed' AND p_new_status = 'Work-In-Progress' THEN
    RETURN p_user_role = 'super_admin';
  END IF;

  -- Super Admin can reject review (return Done -> Work-In-Progress)
  IF p_old_status = 'Done' AND p_new_status = 'Work-In-Progress' THEN
    RETURN p_user_role = 'super_admin';
  END IF;

  -- Standard transitions (allowed for all users)
  IF p_old_status = 'ToDo' AND p_new_status = 'Work-In-Progress' THEN
    RETURN true;
  END IF;

  IF p_old_status = 'Work-In-Progress' AND p_new_status = 'Done' THEN
    RETURN true;
  END IF;

  IF p_old_status = 'Done' AND p_new_status = 'Closed' THEN
    RETURN p_user_role = 'super_admin';
  END IF;

  -- No other transitions allowed
  RETURN false;
END;
$$;
