-- SOLAPI status code 4000 means delivery completed. Repair rows that were
-- previously classified as delivery failures by the polling worker.
UPDATE "installation_notifications"
SET
  "status" = 'SENT',
  "error_code" = NULL,
  "error_message" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "provider_status_code" = '4000'
  AND UPPER(COALESCE("provider_status", '')) NOT LIKE '%FAIL%'
  AND UPPER(COALESCE("provider_status", '')) NOT LIKE '%ERROR%'
  AND "error_code" = 'SMS_DELIVERY_FAILED';

UPDATE "installation_issues" AS issue
SET
  "status" = 'RESOLVED',
  "resolved_at" = CURRENT_TIMESTAMP,
  "resolution_note" = 'SOLAPI 발송완료 코드(4000) 오분류 정정',
  "updated_at" = CURRENT_TIMESTAMP
WHERE issue."status" = 'OPEN'
  AND issue."metadata"->>'failureStage' = 'DELIVERY'
  AND EXISTS (
    SELECT 1
    FROM "installation_notifications" AS notification
    WHERE notification."id" = issue."metadata"->>'notificationId'
      AND notification."provider_status_code" = '4000'
      AND UPPER(COALESCE(notification."provider_status", '')) NOT LIKE '%FAIL%'
      AND UPPER(COALESCE(notification."provider_status", '')) NOT LIKE '%ERROR%'
  );

-- Older deployments may have applied the backoffice migration before the
-- partial unique index was added. Resolve duplicate open rows before ensuring
-- the index exists.
WITH ranked_open_issues AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "installation_order_id", "type"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS row_number
  FROM "installation_issues"
  WHERE "status" = 'OPEN'
)
UPDATE "installation_issues" AS issue
SET
  "status" = 'RESOLVED',
  "resolved_at" = CURRENT_TIMESTAMP,
  "resolution_note" = '중복 생성된 열린 예외 자동 정리',
  "updated_at" = CURRENT_TIMESTAMP
FROM ranked_open_issues
WHERE issue."id" = ranked_open_issues."id"
  AND ranked_open_issues.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "installation_issues_one_open_per_type_idx"
  ON "installation_issues" ("installation_order_id", "type")
  WHERE "status" = 'OPEN';

UPDATE "installation_orders" AS installation_order
SET
  "has_open_issue" = EXISTS (
    SELECT 1
    FROM "installation_issues" AS issue
    WHERE issue."installation_order_id" = installation_order."id"
      AND issue."status" = 'OPEN'
  ),
  "updated_at" = CURRENT_TIMESTAMP;
