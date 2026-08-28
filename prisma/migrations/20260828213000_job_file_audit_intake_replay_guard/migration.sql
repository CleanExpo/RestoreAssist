-- A paid Job File Audit checkout session is a single-use fulfilment grant.
-- Keep the control on the shared ticket row so concurrent requests cannot
-- create duplicate work even when they race across different application
-- instances. Ordinary support tickets leave this nullable.
ALTER TABLE "SupportTicket"
  ADD COLUMN "externalReference" TEXT;
