-- JSON-based notification preferences on profiles.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "email_daily_digest": true,
  "email_weekly_summary": true,
  "email_critical_alerts": true,
  "email_recommendations": false,
  "email_team_activity": false,
  "in_app_all": true,
  "slack_critical_alerts": false,
  "slack_daily_digest": false
}'::jsonb;

