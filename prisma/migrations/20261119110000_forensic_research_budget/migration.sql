BEGIN;

-- Shared RestoreAssist control database. Account references are labels, never keys.
CREATE SCHEMA forensic_research;
REVOKE ALL ON SCHEMA forensic_research FROM PUBLIC;

CREATE TABLE forensic_research.owner_budget (
    account_ref text PRIMARY KEY CHECK (account_ref ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
    enabled boolean NOT NULL DEFAULT false,
    cap_micro_usd bigint NOT NULL CHECK (cap_micro_usd > 0)
);

CREATE TABLE forensic_research.case_policy (
    workspace_id text NOT NULL REFERENCES public."Workspace"(id) ON DELETE RESTRICT,
    application_id text NOT NULL CHECK (length(trim(application_id)) BETWEEN 1 AND 160),
    account_ref text NOT NULL REFERENCES forensic_research.owner_budget(account_ref) ON DELETE RESTRICT,
    approved_packet_sha256 text NOT NULL CHECK (approved_packet_sha256 ~ '^[0-9a-f]{64}$'),
    approved_by text NOT NULL CHECK (length(trim(approved_by)) BETWEEN 1 AND 160),
    approved_at timestamptz NOT NULL DEFAULT now(),
    enabled boolean NOT NULL DEFAULT false,
    cap_micro_usd bigint NOT NULL CHECK (cap_micro_usd > 0),
    PRIMARY KEY (workspace_id, application_id),
    UNIQUE (workspace_id, application_id, account_ref)
);

CREATE TABLE forensic_research.reservation (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    workspace_id text NOT NULL,
    application_id text NOT NULL,
    account_ref text NOT NULL,
    packet_sha256 text NOT NULL CHECK (packet_sha256 ~ '^[0-9a-f]{64}$'),
    idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 160),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, application_id, account_ref)
      REFERENCES forensic_research.case_policy(workspace_id, application_id, account_ref) ON DELETE RESTRICT,
    UNIQUE (workspace_id, application_id, idempotency_key)
);
CREATE INDEX reservation_account_idx ON forensic_research.reservation(account_ref);

CREATE TABLE forensic_research.model_receipt (
    reservation_id bigint NOT NULL REFERENCES forensic_research.reservation(id) ON DELETE RESTRICT,
    model text NOT NULL CHECK (model IN ('moonshotai/kimi-k3.1-pro','deepseek/deepseek-v4.1-flash-1017')),
    held_micro_usd bigint NOT NULL CHECK (held_micro_usd > 0),
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
    status text NOT NULL DEFAULT 'held'
      CHECK (status IN ('held','started','unknown','settled','cancelled')),
    generation_id text UNIQUE CHECK (length(trim(generation_id)) BETWEEN 1 AND 160),
    actual_micro_usd bigint CHECK (actual_micro_usd >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (reservation_id, model),
    CHECK ((status = 'settled') = (actual_micro_usd IS NOT NULL)),
    CHECK (status <> 'settled' OR generation_id IS NOT NULL)
);

-- No public policies. Only the migration owner can maintain the policy
-- tables. Grant narrowly scoped function execution to the worker separately.
ALTER TABLE forensic_research.owner_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_research.case_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_research.reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_research.model_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA forensic_research FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA forensic_research FROM PUBLIC;

-- Both budgets are checked with a single lock per owner and then case. All
-- pending and unknown calls count as held. Settled calls count at actual cost.
CREATE FUNCTION forensic_research.reserve_pair(
    p_workspace text, p_application text, p_packet text, p_idempotency text,
    p_kimi_micro_usd bigint, p_deepseek_micro_usd bigint, p_kimi_request text, p_deepseek_request text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, forensic_research
AS $function$
DECLARE
    owner_row forensic_research.owner_budget%ROWTYPE;
    policy_row forensic_research.case_policy%ROWTYPE;
    previous forensic_research.reservation%ROWTYPE;
    required_cost numeric;
    owner_spent numeric;
    case_spent numeric;
    rid bigint;
BEGIN
    IF p_kimi_micro_usd IS NULL OR p_kimi_micro_usd <= 0
        OR p_deepseek_micro_usd IS NULL OR p_deepseek_micro_usd <= 0
        OR p_kimi_request IS NULL OR p_kimi_request !~ '^[0-9a-f]{64}$'
        OR p_deepseek_request IS NULL OR p_deepseek_request !~ '^[0-9a-f]{64}$'
        OR p_packet IS NULL OR p_packet !~ '^[0-9a-f]{64}$'
        OR p_idempotency IS NULL OR length(trim(p_idempotency)) NOT BETWEEN 1 AND 160 THEN
        RAISE EXCEPTION 'Invalid research reservation input';
    END IF;
    SELECT b.* INTO owner_row
    FROM forensic_research.owner_budget b
    JOIN forensic_research.case_policy p ON p.account_ref = b.account_ref
    WHERE p.workspace_id = p_workspace AND p.application_id = p_application
    FOR UPDATE OF b;
    IF NOT FOUND OR NOT owner_row.enabled THEN
        RAISE EXCEPTION 'Owner research is disabled';
    END IF;

    SELECT * INTO policy_row FROM forensic_research.case_policy
    WHERE workspace_id = p_workspace AND application_id = p_application FOR UPDATE;
    IF NOT FOUND OR NOT policy_row.enabled OR policy_row.account_ref <> owner_row.account_ref
        OR policy_row.approved_packet_sha256 <> p_packet THEN
        RAISE EXCEPTION 'Approved research packet required';
    END IF;

    SELECT * INTO previous FROM forensic_research.reservation
    WHERE workspace_id = p_workspace AND application_id = p_application AND idempotency_key = p_idempotency;
    IF FOUND THEN
        IF previous.packet_sha256 <> p_packet OR EXISTS (
            SELECT 1 FROM forensic_research.model_receipt
            WHERE reservation_id = previous.id AND (
              held_micro_usd <> CASE model WHEN 'moonshotai/kimi-k3.1-pro' THEN p_kimi_micro_usd ELSE p_deepseek_micro_usd END
              OR request_sha256 <> CASE model WHEN 'moonshotai/kimi-k3.1-pro' THEN p_kimi_request ELSE p_deepseek_request END
            )
        ) THEN
            RAISE EXCEPTION 'Reservation replay differs from original';
        END IF;
        RETURN previous.id;
    END IF;

    required_cost := p_kimi_micro_usd::numeric + p_deepseek_micro_usd::numeric;
    SELECT coalesce(sum(CASE WHEN m.status = 'settled' THEN m.actual_micro_usd
                        WHEN m.status = 'cancelled' THEN 0 ELSE m.held_micro_usd END), 0),
           coalesce(sum(CASE WHEN m.status = 'settled' THEN m.actual_micro_usd
                        WHEN m.status = 'cancelled' THEN 0 ELSE m.held_micro_usd END)
                     FILTER (WHERE r.workspace_id = p_workspace AND r.application_id = p_application), 0)
    INTO owner_spent, case_spent
    FROM forensic_research.reservation r
    JOIN forensic_research.model_receipt m ON m.reservation_id = r.id
    WHERE r.account_ref = owner_row.account_ref;
    IF owner_spent + required_cost > owner_row.cap_micro_usd
        OR case_spent + required_cost > policy_row.cap_micro_usd THEN
        RAISE EXCEPTION 'Research budget exceeded';
    END IF;

    INSERT INTO forensic_research.reservation(workspace_id, application_id, account_ref, packet_sha256, idempotency_key)
    VALUES (p_workspace, p_application, owner_row.account_ref, p_packet, p_idempotency)
    RETURNING id INTO rid;
    INSERT INTO forensic_research.model_receipt(reservation_id, model, held_micro_usd, request_sha256) VALUES
      (rid,'moonshotai/kimi-k3.1-pro',p_kimi_micro_usd,p_kimi_request),
      (rid,'deepseek/deepseek-v4.1-flash-1017',p_deepseek_micro_usd,p_deepseek_request);
    RETURN rid;
END;
$function$;

-- Transition once before any outbound inference. Never retry a claimed model
-- blindly. Recheck the case and packet approval when taking the lease.
CREATE FUNCTION forensic_research.claim_model(
    p_workspace text, p_application text, p_id bigint, p_packet text, p_model text, p_request text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, forensic_research
AS $function$
BEGIN
    PERFORM b.account_ref
    FROM forensic_research.reservation r
    JOIN forensic_research.owner_budget b USING(account_ref)
    WHERE r.id=p_id AND r.workspace_id=p_workspace AND r.application_id=p_application
      AND r.packet_sha256=p_packet AND b.enabled
    FOR UPDATE OF b;
    IF NOT FOUND THEN RETURN false; END IF;

    PERFORM 1 FROM forensic_research.case_policy p
    WHERE p.workspace_id=p_workspace AND p.application_id=p_application AND p.enabled
      AND p.approved_packet_sha256=p_packet
    FOR UPDATE OF p;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE forensic_research.model_receipt
    SET status='started', updated_at=now()
    WHERE reservation_id=p_id AND model=p_model AND request_sha256=p_request AND status='held';
    RETURN FOUND;
END;
$function$;

-- Settle using provider metadata verified by a trusted reconciliation worker.
-- NULL cost retains the hold, including if the request failed after dispatch.
-- Cancellation can release a lease only before it was ever claimed.
CREATE FUNCTION forensic_research.reconcile_model(
    p_workspace text, p_application text, p_id bigint, p_model text,
    p_generation_id text, p_actual_micro_usd bigint, p_cancel_unstarted boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, forensic_research
AS $function$
BEGIN
    PERFORM b.account_ref
    FROM forensic_research.reservation r JOIN forensic_research.owner_budget b USING(account_ref)
    WHERE r.id=p_id AND r.workspace_id=p_workspace AND r.application_id=p_application
    FOR UPDATE OF b;
    IF NOT FOUND THEN RETURN false; END IF;

    IF p_cancel_unstarted IS TRUE THEN
        IF p_generation_id IS NOT NULL OR p_actual_micro_usd IS NOT NULL THEN
            RAISE EXCEPTION 'Cancellation cannot contain usage';
        END IF;
        UPDATE forensic_research.model_receipt SET status='cancelled', updated_at=now()
        WHERE reservation_id=p_id AND model=p_model AND status='held';
        RETURN FOUND;
    END IF;
    IF p_actual_micro_usd IS NOT NULL AND (p_actual_micro_usd < 0
        OR p_generation_id IS NULL OR length(trim(p_generation_id)) NOT BETWEEN 1 AND 160) THEN
        RAISE EXCEPTION 'Verified usage requires provider generation ID and a nonnegative charge';
    END IF;

    UPDATE forensic_research.model_receipt
    SET status=CASE WHEN p_actual_micro_usd IS NULL THEN 'unknown' ELSE 'settled' END,
        actual_micro_usd=p_actual_micro_usd,
        generation_id=coalesce(p_generation_id,generation_id),
        updated_at=now()
    WHERE reservation_id=p_id AND model=p_model AND status IN ('started','unknown')
      AND (generation_id IS NULL OR p_generation_id IS NULL OR generation_id=p_generation_id);
    RETURN FOUND;
END;
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forensic_research FROM PUBLIC;
COMMIT;
