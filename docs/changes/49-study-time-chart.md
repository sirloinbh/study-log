# #49 차트 라이브러리 선정과 학습 시간 그래프

- 이슈: [#49](https://github.com/sirloinbh/study-log/issues/49) (상위 #8)
- 브랜치: `feat/49-study-time-chart`
- 선행: #48 통계 대시보드 메인과 주요 지표 카드 (병합 완료)

## 목적

통계 화면에서 일·주·월 학습 시간 추이를 그래프로 본다.

## 결정

- 라이브러리는 사용자가 **Recharts**로 정했다([결정 코멘트](https://github.com/sirloinbh/study-log/issues/49#issuecomment-6360593234)).
- 비교한 후보
  - 직접 SVG: 설치 없음. #20 학습 패턴처럼 CSS로 그릴 수 있다.
  - Chart.js: 캔버스 기반, React 래퍼가 필요하다.
  - Recharts: React 컴포넌트로 축·툴팁·반응형이 갖춰져 있다.
- 번들
  - Recharts를 그대로 import하면 메인 JS가 gzip 129.58 kB → 239.24 kB(+110 kB)로 늘었다.
  - 그래서 그래프 컴포넌트에서 동적으로 불러온다. 메인 JS는 130.65 kB(+1 kB)이고, Recharts는 통계 화면을 열 때 받는 별도 파일(gzip 158.27 kB)이다.
- 그래프 규칙
  - 막대 하나가 하루, 한 주(일요일부터, #96), 한 달이다.
  - 기본 단위: 이번 주·이번 달은 일, 최근 3개월은 주, 전체는 월. 기간마다 고른 단위를 기억한다.
  - 막대 높이는 시간(소수 첫째 자리)이고, 툴팁은 정확한 시간·분이다.
  - 데이터는 기존 `GET /api/stats/study-time`의 `daily`·`weekly`·`monthly`를 쓴다. API는 바꾸지 않았다.
  - 학습 기록이 없으면 그래프 대신 "이 기간에는 학습 기록이 없습니다"를 보여 준다.
  - 그래프는 화면 낭독기에서 숨긴다(`aria-hidden`). 대신 "N개 날 중 가장 많이 공부한 날은 …"이라는 문장으로 알린다.

## 설치 전 확인(글로벌 공급망 규칙)

- `recharts@3.10.1`
  - 2026-07-25 게시, 게시자는 GitHub Actions(SLSA provenance 있음)
  - 저장소는 `github.com/recharts/recharts`, 관리자 3명
  - `prepare`(husky)는 레지스트리 설치에서 실행되지 않는다.
  - 버전을 정확히 고정하고 `--ignore-scripts`로 설치했다.
- 새 패키지는 39개다. 대부분 d3 계열(mbostock), Redux Toolkit 계열, es-toolkit, victory-vendor 등이다.
  - install script 없음, 모두 `registry.npmjs.org`
  - 기존 패키지 변경·삭제 없음
- 14일이 지나지 않은 버전이 있어 `overrides`로 고정했다. 루트 `package.json`이 워크스페이스에, `frontend/package.json`이 하위 저장소 단독 설치에 적용된다.
  - `immer`: 범위 `^11.1.8`이 최신 11.2.9를 골랐는데, 2026-10-22 게시였다. 사흘 사이에 11.1.22~11.2.9가 연달아 나와 있었다. 11.1.21(2026-10-02)로 고정했다.
  - `react-is`(Recharts의 peer): 최신 19.3.1이 2026-10-14 게시였다. 설치된 React와 같은 19.3.0(2026-09-09)으로 고정했다.
- 고정 후 가장 최근 게시는 `@reduxjs/toolkit@2.13.0`(2026-09-29)이다.
- 코드 검사: 새 폴더 38개에서 유출 주소, 토큰 변수, 비정상 파일, install hook을 찾았고, 해당 없음이었다.
  - `child_process`가 나온 곳은 `es-toolkit/dist/server/exec`뿐이다. 문서화된 서버용 `exec` 함수이고, Recharts는 쓰지 않는다.
- `frontend/package-lock.json`
  - 임시 폴더에서 `--package-lock-only --ignore-scripts`로 다시 만들었다.
  - 추가된 39개 항목은 루트와 버전·integrity가 같다.
  - 지워진 줄은 의존성 목록의 마지막 쉼표 한 줄뿐이다.

## 변경

- `frontend/src/study-stats.ts`
  - `chartUnits`·`chartUnitLabels`·`defaultChartUnit`
  - `chartBars(stats, unit)`: 막대 목록. 이름표는 일 "10/21", 주 "10/18~", 월 "26.10"이다.
  - `busiestBar`: 가장 많은 막대. 같으면 앞의 것, 기록이 없으면 없음.
- `frontend/src/StudyTimeChart.tsx`(새 파일)
  - "학습 시간 추이" 카드에 일/주/월 버튼(`aria-pressed`), 요약 문장, 막대 그래프를 담았다.
  - Recharts는 처음 쓸 때 `import('recharts')`로 받고, 받은 뒤에는 모듈에 보관한다.
  - 받는 동안 "그래프를 불러오는 중…", 실패하면 "그래프를 불러오지 못했습니다"를 보여 준다. 요약 문장은 그대로 남는다.
- `frontend/src/Stats.tsx`: 지표 카드와 히트맵 사이에 그래프를 넣었다. 기간별로 고른 단위는 대시보드가 보관한다. 다른 기간을 불러오는 동안 그래프가 사라져도 단위를 잃지 않게 하기 위해서다.
- `frontend/src/style.css`: 그래프 카드 머리, 막대 색(`currentColor` = `--primary`), 축 글자색
- `backend/test/ui-harness.ts`: `recharts` 대역을 넣었다.
  - 각 부품을 `recharts:Bar` 같은 요소로 남기고 props를 보존한다.
  - `then`이 없어서 동적 import로 받아도 promise로 오인되지 않는다.

## 테스트

- `backend/test/stats-ui.test.ts`
  - 일 단위 막대 데이터(시간)와 요약 문장, 막대의 `dataKey`, 툴팁의 시간·분
  - 일→주→월 전환, 막대 하나(단일 데이터)도 그래프와 문장으로 표시
  - 다른 기간의 기본 단위, 돌아오면 고른 단위 유지
  - 빈 데이터, 모두 0분인 데이터: 그래프 없이 안내
  - 그래프 파일을 받지 못하면 오류 표시, 요약 문장 유지
  - `chartBars` 월 이름표·시간 반올림, `busiestBar` 동점·없음
  - 기존 기간 버튼 테스트는 기간 그룹 안의 버튼만 보도록 좁혔다. 그래프 단위 버튼도 `aria-pressed`를 쓰기 때문이다.

## 검증

| 명령                   | 환경                                                        | 결과                                                        |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run check`        | 로컬, `TEST_DATABASE_URL` 미설정                            | exit 0. backend tests 254, pass 236, fail 0, skipped 18(DB) |
| `npm test` (기본 병렬) | 로컬 Docker `postgres:17-alpine`, 마이그레이션 001~010 적용 | exit 0. tests 254, pass 254, fail 0, skipped 0              |
| `vite build` 크기      | 로컬                                                        | 메인 gzip 130.65 kB, Recharts 별도 158.27 kB                |

- 브라우저: Playwright(Chromium)로 Vite 개발 서버와 로컬 API(Docker 테스트 DB의 기존 기록)를 띄워 확인했다.
  - 모바일 390×844, 이번 주
    - 막대 4개가 보였고, 기록 없는 날은 높이가 0이었다.
    - 요약은 "6개 날 중 가장 많이 공부한 날은 10/23(2시간 45분)입니다."였다.
    - 막대 색은 `rgb(41, 68, 50)`(`--primary`)였고, 가로 스크롤은 없었다.
  - PC 1440×900, 최근 3개월
    - 기본 단위가 "주"였고 막대는 14개였다.
    - 요약은 "14개 주 중 가장 많이 공부한 주는 10/18~(7시간 30분)입니다."였다.
    - 막대에 마우스를 올리면 툴팁에 "10/11~ 학습 시간 : 3시간 25분"이 보였다.
  - 스크린샷: [모바일 390×844 (이번 주, 일)](assets/49-mobile-390x844.png), [PC 1440×900 (최근 3개월, 주, 툴팁)](assets/49-pc-1440x900.png)

## 한계·후속

- 선 그래프는 넣지 않았다. 막대 하나로 일·주·월을 모두 보여 준다. 추이선이 필요하면 같은 데이터로 `Line`을 더할 수 있다.
- "전체"를 일 단위로 보면 막대가 매우 많아(최대 3653개) 가늘어진다. 기본 단위는 월이다.
- 복습 완료율 차트(#52)는 복습 기능(#41~#46) 뒤에 같은 방식으로 붙인다.

## 리뷰

- 1차 자동 리뷰(읽기 전용, 별도 에이전트): 보완점 없음
  - 확인한 항목
    - 이름표, 시간 반올림, 동점 규칙, 요약 문장 조사
    - 지연 로딩(캐시, 늦은 응답, 실패)
    - Recharts v3 props(툴팁 형식 함수 등)
    - 접근성
    - `overrides`와 Redux Toolkit·react-redux 범위의 호환
  - 참고(보고 기준 미만)
    - "전체"를 일 단위로 고르면 막대가 많아져 애니메이션이 느릴 수 있다. 측정하지 않았고, 기본 단위는 월이다.
    - 약 2분 이하의 기록은 시간 반올림으로 막대 높이가 0이 된다. 요약과 툴팁에는 그대로 보인다.
  - 보완점이 없어 2차 리뷰는 하지 않았다.
