-- RA-4827 perf advisor batch 2: wrap auth.uid() in (select auth.uid()) so PG
-- caches it once per query instead of evaluating it per-row. Drops the
-- `auth_rls_initplan` WARN count (currently 47) to 0.
--
-- Each ALTER POLICY rewrites the same predicate verbatim with auth.uid()
-- replaced. Idempotent only in the sense that running it twice yields the
-- same final state (the substitution is one-way: `auth.uid()` →
-- `(select auth.uid())`, and re-running produces no additional wrapping).

ALTER POLICY "Client_delete" ON public."Client"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND is_workspace_owner("workspaceId"))));

ALTER POLICY "Client_insert" ON public."Client"
  WITH CHECK ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Client_select" ON public."Client"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Client_update" ON public."Client"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "CostLibrary_delete" ON public."CostLibrary"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND is_workspace_owner("workspaceId"))));

ALTER POLICY "CostLibrary_insert" ON public."CostLibrary"
  WITH CHECK ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "CostLibrary_select" ON public."CostLibrary"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "CostLibrary_update" ON public."CostLibrary"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "historicaljob_delete_own" ON public."HistoricalJob"
  USING (("tenantId" = ((select auth.uid()))::text));

ALTER POLICY "historicaljob_insert_own" ON public."HistoricalJob"
  WITH CHECK (("tenantId" = ((select auth.uid()))::text));

ALTER POLICY "historicaljob_select_own" ON public."HistoricalJob"
  USING (("tenantId" = ((select auth.uid()))::text));

ALTER POLICY "historicaljob_update_own" ON public."HistoricalJob"
  USING (("tenantId" = ((select auth.uid()))::text));

ALTER POLICY "Inspection_delete" ON public."Inspection"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND is_workspace_owner("workspaceId"))));

ALTER POLICY "Inspection_insert" ON public."Inspection"
  WITH CHECK ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Inspection_select" ON public."Inspection"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Inspection_update" ON public."Inspection"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Integration_delete" ON public."Integration"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND is_workspace_owner("workspaceId"))));

ALTER POLICY "Integration_insert" ON public."Integration"
  WITH CHECK ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Integration_select" ON public."Integration"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Integration_update" ON public."Integration"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Invoice_delete" ON public."Invoice"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND is_workspace_owner("workspaceId"))));

ALTER POLICY "Invoice_insert" ON public."Invoice"
  WITH CHECK ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Invoice_select" ON public."Invoice"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Invoice_update" ON public."Invoice"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "InvoiceSequence: owner delete" ON public."InvoiceSequence"
  USING (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceSequence: owner insert" ON public."InvoiceSequence"
  WITH CHECK (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceSequence: owner select" ON public."InvoiceSequence"
  USING (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceSequence: owner update" ON public."InvoiceSequence"
  USING (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceTemplate: owner delete" ON public."InvoiceTemplate"
  USING (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceTemplate: owner insert" ON public."InvoiceTemplate"
  WITH CHECK (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceTemplate: owner select" ON public."InvoiceTemplate"
  USING (("userId" = ((select auth.uid()))::text));

ALTER POLICY "InvoiceTemplate: owner update" ON public."InvoiceTemplate"
  USING (("userId" = ((select auth.uid()))::text));

ALTER POLICY "MobileInspection_delete_own" ON public."MobileInspection"
  USING ((((select auth.uid()))::text = "userId"));

ALTER POLICY "MobileInspection_insert_own" ON public."MobileInspection"
  WITH CHECK ((((select auth.uid()))::text = "userId"));

ALTER POLICY "MobileInspection_select_own" ON public."MobileInspection"
  USING ((((select auth.uid()))::text = "userId"));

ALTER POLICY "MobileInspection_update_own" ON public."MobileInspection"
  USING ((((select auth.uid()))::text = "userId"))
  WITH CHECK ((((select auth.uid()))::text = "userId"));

ALTER POLICY "PushToken_delete_own" ON public."PushToken"
  USING ((((select auth.uid()))::text = "userId"));

ALTER POLICY "PushToken_insert_own" ON public."PushToken"
  WITH CHECK ((((select auth.uid()))::text = "userId"));

ALTER POLICY "PushToken_select_own" ON public."PushToken"
  USING ((((select auth.uid()))::text = "userId"));

ALTER POLICY "PushToken_update_own" ON public."PushToken"
  WITH CHECK ((((select auth.uid()))::text = "userId"));

ALTER POLICY "Report_delete" ON public."Report"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND is_workspace_owner("workspaceId"))));

ALTER POLICY "Report_insert" ON public."Report"
  WITH CHECK ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Report_select" ON public."Report"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Report_update" ON public."Report"
  USING ((("userId" = ((select auth.uid()))::text) OR (("workspaceId" IS NOT NULL) AND (is_workspace_owner("workspaceId") OR is_workspace_member("workspaceId")))));

ALTER POLICY "Users can update own profile" ON public."profiles"
  USING (((select auth.uid()) = id));

ALTER POLICY "Users can view own profile" ON public."profiles"
  USING (((select auth.uid()) = id));
