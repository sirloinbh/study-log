-- Remove the study timer (#474). The single-row table held at most one transient timer, so nothing
-- of value is lost. Migration 026 stays as it is.
DROP TABLE IF EXISTS study_timer;
