-- PL ENG 주문의 설치 품목을 본사 관리자가 추가·삭제·수정할 수 있게 한다.
-- 값이 없으면(NULL) 화면에서 원천 메모의 용역 품목을 이카운트 품목명으로 자동 변환해 보여준다.
ALTER TABLE "installation_orders"
  ADD COLUMN IF NOT EXISTS "partner_install_items" JSONB;
