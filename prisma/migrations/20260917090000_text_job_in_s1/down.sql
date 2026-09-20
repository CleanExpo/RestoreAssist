-- Reverse of 20260917090000_text_job_in_s1.
--
-- Drops exactly the two tables the forward migration creates. Their indexes,
-- foreign keys and RLS settings go with them. InboundJobMessage has no
-- dependants and MessagingIdentity references only User, so order does not
-- matter; nothing that existed before this migration is touched.

DROP TABLE IF EXISTS "InboundJobMessage";
DROP TABLE IF EXISTS "MessagingIdentity";
