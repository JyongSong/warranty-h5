-- 기사 명단(엑셀)을 반영할 때 필요한 두 컬럼.

-- 1) 이번 명단에 들어 있는 기사인지.
--    active 와는 다른 축이다. 명단에서 빠진 기사를 바로 배차에서 끊지 않고,
--    우선 "이번 명단에 없음" 으로 표시만 해 둔다. 배차 중단은 사람이 따로 판단한다.
--    명단을 반영할 때마다 전체를 false 로 내린 뒤 명단에 있는 사람만 true 로 올린다.

-- 2) A/S 긴급출동 가능 여부. 엑셀의 해당 칸을 원문 그대로 받는다.
--    예: "주중 / 야간 모두 가능". 앞으로 A/S 배차가 이 값을 참고한다.
--    값의 종류가 아직 확정되지 않아(0828 명단은 이 칸이 전부 비어 있다) TEXT 로
--    두고, 실제 값이 쌓이면 그때 열거형으로 정리한다.

ALTER TABLE "installers"
  ADD COLUMN IF NOT EXISTS "in_current_roster" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "as_emergency_availability" TEXT;
