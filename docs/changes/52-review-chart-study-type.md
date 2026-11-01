# #52 복습 완료율 차트와 학습 유형 필터

- 이슈: [#52](https://github.com/sirloinbh/study-log/issues/52)
- 브랜치: `feat/52-review-chart-study-type`
- 규칙: [복습 주기 규칙](../decisions/review-rules.md) 6장

## 목적

통계 화면에서 복습을 얼마나 지켰는지 보고, 학습 시간을 신규 학습과 복습으로 나눠 본다.

## 사용자 결정 (2026-11-01)

학습 유형은 학습 기록을 쓸 때 직접 고른다. 기본값은 신규이고, 기존 기록도 모두 신규로 시작한다. 필터는 통계 화면의 학습 시간 지표와 그래프에 적용한다.

## 변경

- `database/migrations/013_study_log_type.sql`: `study_logs.study_type`(`new`, `review`, 기본 `new`).
- `backend/src/study-logs.ts`: 저장·수정·조회에 `studyType`을 더했다.
- `backend/src/stats.ts`: `GET /api/stats/study-time`에 `type=all|new|review`를 더했다. 기본은 `all`이고, 총 학습 시간까지 고른 유형으로 계산한다.
- `frontend/src/StudyLogs.tsx`: 입력 폼에 유형을 더했다. 목록, 검색 결과, 캘린더에는 복습인 기록에만 `복습` 표시를 단다.
- `frontend/src/Stats.tsx`: 기간 아래에 학습 유형 필터를 더했다.
- `frontend/src/ReviewRateChart.tsx`: 완료율과 예정·완료·지연 막대를 보여 준다. 차트 라이브러리를 불러오는 코드는 `frontend/src/use-recharts.ts`로 옮겨 학습 시간 그래프와 함께 쓴다.

## 구현 판단

- 히트맵은 기간 필터도 받지 않는 "최근 1년" 그래프라 유형 필터도 적용하지 않는다. 복습 완료율도 유형과 무관하다.
- 지연은 예정과 겹치고, 늦은 완료는 완료와도 겹친다. 그래서 쌓는 막대 대신 세 개의 별도 막대로 그린다.
- 막대 위 숫자 대신 축 이름에 횟수를 넣는다(`완료 0회`). Recharts는 높이 0인 막대의 숫자를 그리지 않아 0회를 읽을 수 없었다.
- 애니메이션을 껐다. 부모 화면이 다시 그려질 때마다 재생되어 필터를 누를 때 복습 그래프까지 움직였다.
- 복습 그래프는 그릴 데이터가 있을 때만 차트 라이브러리를 불러온다. 처음에는 응답이 실패해도 불러와, 실패 응답만 받는 `app.test.tsx`가 전체 검사에서 시간 초과로 실패했다. 학습 시간 그래프는 응답이 성공하면 기록이 없어도 불러오며, 이번에 바꾸지 않았다.

## 검증

`TEST_DATABASE_URL`을 설정한 `npm run check`가 통과했다. 백엔드 338건, 프런트 123건, 스킬 4건이 통과했다. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다.

테스트 DB에 마이그레이션 013을 적용하고, headless Chrome으로 PC 1440×900과 모바일 390×844에서 35개 항목을 확인했다. 완료율과 막대, 축 이름 3개, 그래프 폭, 가로 스크롤 없음, 유형 필터, 기간 변경, 입력 폼의 유형, 목록의 복습 표시가 포함된다. 기록은 확인 후 지웠다.

전체 페이지 스크린샷에서 그래프가 좁게 찍힌 적이 있으나, 화면 크기 안에서 측정한 폭은 카드와 같았다(PC 910px, 모바일 308px). 캡처 때문에 생긴 현상이다.

## 리뷰

1차 리뷰에서 런타임 결함은 없었고 낮은 수준의 지적 4건을 반영했다.

- 전체 기간의 시작일이 유형마다 다른 점을 규칙 6장에 적었다.
- 차트 라이브러리를 불러오는 조건의 설명을 복습 그래프로 좁혔다.
- 다른 기간의 유형 필터, 필터 뒤의 히트맵, 기록 없는 유형, 검색과 캘린더의 복습 표시, 새 제약 조건의 테스트를 더했다.
- 공유 테스트 DB에 복습 기록이 남아 있어도 통과하도록 기준값을 유형별로 잡았다.

## 테스트

- `backend/test/study-log-type.test.ts`: 잘못된 유형의 400, 기본값 신규, 저장·조회·수정.
- `backend/test/stats.integration.test.ts`: 유형별 지표와 일별 합계, 기본값, 400.
- `frontend/src/stats-review.test.tsx`: 완료율과 횟수, 기간 변경, 예정 0, 실패 표시, 필터가 복습 통계를 다시 부르지 않음, 막대 값.
- `frontend/src/study-logs-type.test.tsx`: 폼의 기본값과 저장, 수정 때 유형 유지, 목록 표시.
- `backend/test/stats-ui.test.ts`, `backend/test/study-logs-ui.test.ts`, `backend/test/study-logs.integration.test.ts`, `frontend/src/study-logs-change.test.tsx`: 새 필드와 요청을 반영했다.
