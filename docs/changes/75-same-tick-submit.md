# #75 같은 틱의 중복 제출을 렌더와 무관한 진행 표시로 막기

- 이슈: [#75](https://github.com/sirloinbh/study-log/issues/75) (#73 리뷰에서 분리)
- 브랜치: `fix/75-same-tick-submit`

## 문제

화면들은 렌더 시점의 `busy` 값으로 중복 요청을 막았다(`if (busy) return`). 다시 그리기 전 같은 틱에 제출이 두 번 들어오면(빠른 Enter 연타 등) 두 핸들러가 모두 `busy === false`를 보았다. 그래서 두 요청이 나가 같은 항목이 두 번 추가될 수 있었다.

## 변경

- `frontend/src/busy.ts`(새 파일): `useBusy()` 훅.
  - `busy`(버튼·입력 잠금 표시용 상태)
  - `begin()`: 진행 중이면 false. 아니면 진행 표시를 켜고 true. 진행 표시는 렌더와 무관한 `useRef`라 같은 틱의 두 번째 호출도 막는다.
  - `end()`: 진행 표시와 `busy`를 끈다.
- `busy` 패턴을 쓰는 화면 전부에 적용했다. `if (busy) return; setBusy(true)` → `if (!begin()) return`, `setBusy(false)` → `end()`.
  - 이슈가 지목한 화면: 목차 카드(`TextbookContents.tsx`), 연습문제 카드(`Exercises.tsx`)
  - 이슈가 확인을 요청한 화면: 교재(`Textbooks.tsx`), 학습 기록(`StudyLogs.tsx`)
  - 같은 패턴이 있어 함께 바꾼 화면: 중요 문제 카드(`ImportantExercises.tsx`), 키워드 화면(`Keywords.tsx`, 추가·수정·삭제와 검색)
- `backend/test/ui-harness.ts`: 테스트용 React 대역에 `useRef`를 추가했다. 상태와 같은 칸에 렌더 사이에 유지되는 객체 하나를 둔다.

## 테스트

- 다시 그리기 전에 렌더된 폼의 `onSubmit`을 두 번 호출하는 테스트를 5개 화면에 하나씩 추가했다. 모두 요청이 한 번만 나가는지 확인한다.
  - `exercises-ui.test.ts`: 문제 추가
  - `textbook-contents-ui.test.ts`: 장 추가
  - `textbooks-ui.test.ts`: 교재 등록
  - `study-logs-ui.test.ts`: 학습 기록 저장
  - `keywords-ui.test.ts`: 키워드 추가. 두 번째 요청의 409 오류도 나오지 않는다.
- 수정 전 코드에서 5건 모두 실패하고(요청 2번), 수정 후 통과하는 것을 확인했다.

## 검증

| 명령            | 환경                             | 결과                                                        |
| --------------- | -------------------------------- | ----------------------------------------------------------- |
| `npm run check` | 로컬, `TEST_DATABASE_URL` 미설정 | exit 0. backend tests 173, pass 161, fail 0, skipped 12(DB) |

- 브라우저(Playwright Chromium, 390×844): 키워드 입력 폼에 `form.requestSubmit()`을 같은 틱에 두 번 호출했다.
  - POST가 1번 나갔다.
  - 목록에 키워드가 1개 생겼고, 409 오류가 없었다.
- 화면 모양은 바뀌지 않아 스크린샷은 남기지 않았다.

## 자동 코드 리뷰 1차

별도 읽기 전용 리뷰 에이전트가 검토했다. 지적이 없어 2차 리뷰는 하지 않는다. 분리할 이슈도 없다.

- 확인된 사항
  - 모든 `begin()` 뒤에 `end()`가 반드시 실행된다. `begin()`은 `try` 바로 앞에 있고, `finally` 안에서 `end()` 전에 기다리는 호출은 내부에서 오류를 잡는다.
  - `if (busy) return`이 남은 곳이 없다. 남은 `busy` 읽기는 잠금 표시와 포커스 effect뿐이다.
  - 요청을 시작하는 핸들러는 모두 `run` 또는 `begin()`을 거친다.
  - 테스트 대역의 `useRef`는 상태와 같은 칸을 써서 훅 순서가 유지되고, 화면에서 빠지면 함께 버려진다.
  - React StrictMode는 이벤트 핸들러를 두 번 실행하지 않아 영향이 없다.

## 한계·후속

- 다른 카드가 보낸 다시 불러오기(예: #74의 목차 다시 불러오기)와 카드 자신의 변경 사이의 응답 순서는 이 변경으로 바뀌지 않는다. 늦게 도착한 옛 목록이 새 목록을 덮을 수 있는 좁은 경합은 남아 있다(#74 리뷰 참고 기록).
