# #46 복습 완료율 통계 API

- 이슈: [#46](https://github.com/sirloinbh/study-log/issues/46)
- 브랜치: `feat/46-review-stats`
- 규칙: [복습 주기 규칙](../decisions/review-rules.md) 5장

## 목적

복습을 얼마나 지켰는지 수치로 제공한다. 화면은 #52에서 만든다.

## 변경

- `backend/src/stats.ts`: `GET /api/stats/reviews?period=week|month|3months|all`. 기본은 이번 주이다. 예정, 완료, 지연 수와 정수 퍼센트 완료율을 준다.
- `docs/decisions/review-rules.md`: 5장에 집계 기준을 적었다.
- `docs/next-steps/README.md`: 다음 후보를 #52로 바꿨다.

## 사용자 결정 (2026-11-01)

- 기간은 원래 예정일 기준이다.
- 지연은 늦은 완료와 지난 미완료이다.
- 완료율은 완료 ÷ 예정이고, 예정이 0이면 없다.

## 발견한 점

`periodStart`의 `Date.UTC`는 0~99년을 1900년대로 해석한다. 기간은 오늘 날짜로 계산하므로 실제 서비스에서는 일어나지 않아 고치지 않았고, 테스트는 100년을 쓴다.

## 리뷰

1차 리뷰에서 코드와 테스트의 결함은 없었다. 규칙 문서의 지연 정의가 3장과 5장에서 달랐고, 학습일 수정의 예외가 빠져 있어 고쳤다. 2차 리뷰는 보완점이 없었다.

## 검증

`TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 335건, 프런트 112건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다. 화면 변경이 없어 브라우저 확인은 하지 않았다.

## 테스트

- `backend/test/stats.test.ts`: 완료율 계산과 반올림, 예정 0.
- `backend/test/review-stats.integration.test.ts`: 기간 4개의 샘플 계산, 제때·늦은·이른 완료, 지난 미완료, 오늘 예정, 미래 제외, 날짜를 옮겨도 변화 없음, 기본 기간, 400. 전체 합계를 비교하므로 다른 이른 날짜 테스트와 DB 잠금으로 순서를 맞춘다.
