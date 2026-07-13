-- Video Engagement Analytics Table
-- Tracks video playback events per user and per organisation
-- Enables data-driven content decisions

CREATE TABLE IF NOT EXISTS public.video_engagement (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id                UUID REFERENCES public.organisation(id) ON DELETE SET NULL,
  video_slug            TEXT NOT NULL,
  event_type            TEXT NOT NULL CHECK (event_type IN ('play','pause','complete','progress_25','progress_50','progress_75')),
  event_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  watch_duration_sec    INTEGER DEFAULT 0,
  total_duration_sec    INTEGER,
  device_type           TEXT CHECK (device_type IN ('desktop','mobile','tablet')),
  browser               TEXT,
  session_id            TEXT,

  CONSTRAINT video_engagement_unique
    UNIQUE(user_id, video_slug, event_type, date_trunc('hour', event_at))
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_ve_user_slug ON public.video_engagement(user_id, video_slug);
CREATE INDEX IF NOT EXISTS idx_ve_org ON public.video_engagement(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ve_slug_event ON public.video_engagement(video_slug, event_type);
CREATE INDEX IF NOT EXISTS idx_ve_event_at ON public.video_engagement(event_at DESC);

-- RLS: Users can only see their own engagement data
ALTER TABLE public.video_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_engagement_select_own
  ON public.video_engagement
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY video_engagement_insert_own
  ON public.video_engagement
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin/policy roles can see all engagement data
CREATE POLICY video_engagement_admin_all
  ON public.video_engagement
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN','OWNER','POLICY')
    )
  );

-- Analytics views for dashboards

-- Completion rate per video
CREATE OR REPLACE VIEW public.video_completion_rates AS
SELECT
  video_slug,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'play') AS total_players,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'complete') AS total_completions,
  ROUND(
    COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'complete')::numeric
    / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'play'), 0)::numeric
    * 100,
    1
  ) AS completion_rate_pct
FROM public.video_engagement
GROUP BY video_slug;

-- Drop-off funnel per video
CREATE OR REPLACE VIEW public.video_dropoff_funnel AS
SELECT
  video_slug,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'play') AS at_play,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'progress_25') AS at_25,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'progress_50') AS at_50,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'progress_75') AS at_75,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'complete') AS at_complete
FROM public.video_engagement
GROUP BY video_slug;

-- Most watched videos (last 30 days)
CREATE OR REPLACE VIEW public.video_trending AS
SELECT
  video_slug,
  COUNT(DISTINCT user_id) AS unique_watchers,
  COUNT(*) AS total_events
FROM public.video_engagement
WHERE event_at > now() - interval '30 days'
GROUP BY video_slug
ORDER BY total_events DESC;
