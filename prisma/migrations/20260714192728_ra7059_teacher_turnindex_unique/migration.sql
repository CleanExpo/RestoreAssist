-- RA-7059: enforce one row per (sessionId, turnIndex) on TeacherUtterance so
-- concurrent /turn POSTs cannot write colliding turnIndex rows. Prod has 0
-- TeacherUtterance rows (verified), so the unique index applies clean.
CREATE UNIQUE INDEX "TeacherUtterance_sessionId_turnIndex_key" ON "TeacherUtterance"("sessionId", "turnIndex");
