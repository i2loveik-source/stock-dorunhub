# ⚠️ DEPRECATED — 이 레포는 더 이상 사용되지 않습니다

이 서비스(`dorun-stock`)는 **두런허브 본 레포(`DoRunHub`)에 통합 완료**되었습니다.

## 통합 위치 (DoRunHub)
- 서버: `server/stock-routes.ts` — `/api/stock/*` 직접 핸들링
- 프론트: `client/src/pages/StockMarket.tsx` — 허브 내부 직접 렌더 (이전: `stock.dorunhub.com` iframe)
- DB: 동일 Neon PostgreSQL의 `investment.*` 스키마

## 이 레포에서의 작업 금지
이 레포에 코드를 추가/수정해도 **운영에 반영되지 않습니다.** 모든 변경은 `DoRunHub` 본 레포에서 진행하세요.

— 통합 완료일: 2026-05-09
