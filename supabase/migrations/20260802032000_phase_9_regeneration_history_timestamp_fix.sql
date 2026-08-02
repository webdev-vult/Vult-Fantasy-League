-- The connected database received this corrective migration after the initial
-- wrapper deployment. Fresh installations already receive the final `now()`
-- implementation from 20260802031500_phase_9_regeneration_history_fix.sql.
select 1;
