# #16 학습 메모 마크다운 작성·렌더링

- 이슈: [#16](https://github.com/sirloinbh/study-log/issues/16) (상위 #9)
- 브랜치: `feat/16-markdown-memo`
- 선행: #11 학습 기록 입력 폼·최근 기록 목록 (병합 완료)

## 목적

학습 메모를 마크다운으로 정리해 읽기 좋게 남긴다. 스크립트가 끼어들어도 실행되지 않아야 한다.

## 결정·라이브러리 선택

- 사용자가 `react-markdown` 설치를 허락했다([이슈 코멘트](https://github.com/sirloinbh/study-log/issues/16)).
- 비교한 후보
  - `react-markdown`: 마크다운을 HTML 문자열이 아니라 React 요소로 만든다. `dangerouslySetInnerHTML`이 필요 없고, 메모 속 HTML은 글자로 보이며, `javascript:` 같은 위험한 주소는 기본으로 비운다.
  - `marked`/`markdown-it`: 더 작지만 HTML 문자열을 만든다. 그래서 `DOMPurify` 같은 정화 라이브러리를 하나 더 설치하고, `dangerouslySetInnerHTML`로 넣어야 한다.
- 번들 크기(이 브랜치에서 `vite build`로 측정): JS 292.84 kB(gzip 87.06 kB) → 414.19 kB(gzip 126.14 kB). gzip 기준 39 kB가 늘었다.

### 설치 전 확인(글로벌 공급망 규칙)

- 게시자·저장소: `react-markdown@10.1.0`(2025-03 게시). 관리자는 johno, wooorm, remcohaszing. 저장소는 `github.com/remarkjs/react-markdown`.
- 설치 명령: `npm install react-markdown@10.1.0 --save-exact --ignore-scripts -w frontend`. 버전을 정확히 고정하고 설치 스크립트는 실행하지 않았다.
- 잠금 파일: 새 패키지 80개가 추가됐다. 기존 패키지는 버전이 바뀌거나 빠진 것이 없다. `hasInstallScript`인 패키지는 없고, 받은 곳은 모두 `registry.npmjs.org`다.
- 게시일: 추가된 모든 버전이 14일보다 오래됐다. 가장 최근은 `mdast-util-to-markdown@2.2.0`(2026-10-03)이다. 2026-07 이후 게시된 9개는 원래 관리자가 올렸다: unified/micromark 계열은 wooorm, `@types/hast`는 DefinitelyTyped 봇, `@ungap/structured-clone`은 webreflection.
- 코드 검사: 새 패키지 79개 폴더에서 다음을 찾았고, 하나도 없었다.
  - `child_process`, `process.env`, `.npmrc`, 토큰 변수
  - 알려진 유출 주소(webhook.site 등)
  - 비정상 위치의 `bundle.js`/`processor.js`/`data.json`
  - install hook

## 변경

- `frontend/src/Memo.tsx`(새 파일): 메모를 `react-markdown`으로 그린다.
  - 링크는 새 탭으로 연다(`target="_blank"`, `rel="noopener noreferrer"`). 작성 중인 폼을 잃지 않기 위해서다.
  - 위험한 주소라 비워진 링크·이미지는 `<a>`/`<img>` 없이 글자만 남긴다. 빈 `src`로 페이지를 다시 요청하는 일도 막는다.
  - `clamp`이면 목록용으로 앞의 몇 줄만 보인다(이전의 3줄 자르기와 같은 역할).
- `frontend/src/StudyLogs.tsx`
  - 메모 입력 아래에 마크다운 안내 문구(`aria-describedby`)를 넣었다.
  - 메모가 비어 있지 않으면 "미리보기"를 보여 준다.
  - 최근 기록 목록은 메모를 마크다운으로 그리되, 앞부분만 보인다.
- `frontend/src/Calendar.tsx`: 날짜 일지는 메모 전체를 마크다운으로 그린다.
- `frontend/src/StudyLogSearch.tsx`: 검색 결과는 메모를 마크다운으로 그리되, 앞부분만 보인다.
- `frontend/src/style.css`
  - `.memo` 스타일: 제목은 본문 크기, 목록·코드·인용·이미지 폭
  - 미리보기·안내 문구 스타일
  - `.log-list li` → `.log-list > li`: 카드 테두리가 메모 안의 목록 항목에도 씌워지던 것을 브라우저 확인 중 발견해 고쳤다.
- 범위 밖: 키워드 메모와 회고 본문은 그대로 일반 글자다.

## 테스트

- `backend/test/markdown.test.ts`(새 파일): 실제 `Memo` 컴포넌트를 `react-markdown`·`react-dom/server`로 그린다.
  - 제목·목록·굵게·코드·링크가 그려지고, 링크에 새 탭 속성이 붙는다.
  - 다음 HTML 입력은 태그가 되지 않고 이스케이프된 글자로 남는다: `<script>`, `<img onerror>`, `<a href="javascript:">`, `<iframe>`, 이벤트 속성
  - 다음 주소의 링크·이미지는 `href`/`src` 없이 글자만 남는다: `javascript:`(대소문자 섞임 포함), `vbscript:`, `data:`, 자동 링크 `<javascript:…>`
  - 안전한 이미지는 그대로 보인다.
- `backend/test/study-logs-ui.test.ts`
  - 목록이 메모를 마크다운 렌더러에 넘기고 앞부분만 보인다.
  - 작성 중 미리보기가 보이고, 빈 메모·공백 메모에는 보이지 않는다.
- `backend/test/ui-harness.ts`: `react-markdown`을 원문을 담은 `markdown` 요소로 대신한다. 실제 렌더링은 위 테스트가 맡는다.

## 검증

| 명령                   | 환경                                                        | 결과                                                        |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `npm run check`        | 로컬, `TEST_DATABASE_URL` 미설정                            | exit 0. backend tests 234, pass 217, fail 0, skipped 17(DB) |
| `vite build` 크기 비교 | 로컬, 변경 전후                                             | gzip 87.06 kB → 126.14 kB                                   |
| `npm test` (기본 병렬) | 로컬 Docker `postgres:17-alpine`, 마이그레이션 001~010 적용 | exit 0. tests 234, pass 234, fail 0, skipped 0              |

- 브라우저: Playwright(Chromium)로 Vite 개발 서버와 로컬 API(Docker 테스트 DB)를 띄워 확인했다.
  - 모바일 390×844
    - 다음 요소가 담긴 메모를 입력했다: 제목, 목록, 굵게, 코드, 인용, 링크, `<script>alert('xss')</script>`, `[위험](javascript:alert(1))`
    - 미리보기: 요소들이 마크다운으로 그려졌다. 스크립트는 `&lt;script&gt;` 글자로, 위험한 링크는 "위험" 글자로만 남았다.
    - 저장 후: 목록의 메모가 87px로 잘렸다. 화면에 `<script>` 요소가 없었고, 가로챈 `alert`도 불리지 않았다. 가로 스크롤은 없었다.
  - PC 1440×900: 달력 일지에 메모 전체가 그려졌다.
    - 처음엔 목록 항목에 카드 테두리가 씌워져 있었다. CSS를 고친 뒤 다시 확인했다.
    - 교재·키워드·회고·학습 기록 화면의 `.log-list` 항목은 모두 직계 자식이다. 따라서 선택자 변경이 다른 화면에 영향을 주지 않는다.
  - 스크린샷: [모바일 390×844 (작성 미리보기)](assets/16-mobile-390x844.png), [PC 1440×900 (달력 일지)](assets/16-pc-1440x900.png)

## 한계·후속

- CommonMark만 지원한다. 표·취소선·체크 목록 같은 GFM 문법은 `remark-gfm` 설치가 필요하므로 이번 범위에서 뺐다(새 패키지 설치는 사용자 확인 필요).
- 번들이 gzip 39 kB 늘었다. 필요하면 메모 렌더러를 지연 로딩(`React.lazy`)으로 나눌 수 있다. 다만 테스트 하네스가 Suspense를 지원하지 않아 이번에는 하지 않았다.
- 외부 이미지 주소는 그대로 불러온다. 이미지를 막을지는 별도 결정이다.

## 리뷰

### 1차 자동 리뷰(읽기 전용, 별도 에이전트)

- 지적: 마크다운은 단락 안의 줄바꿈 한 번(Enter)을 공백으로 접는다. 이전에는 `.log-memo`의 `pre-wrap`으로 줄이 나뉘어 보였으므로, 기존 메모가 한 줄로 합쳐 보인다.
  - 반영(커밋 "fix: keep single line breaks in markdown memos")
    - `.memo p { white-space: pre-line; }`: 단락 안의 줄바꿈을 그대로 보인다. `.memo` 전체에 주면 블록 사이 개행이 빈 줄이 되므로 `p`에만 준다. 줄바꿈 플러그인(`remark-breaks`)은 새 패키지라 쓰지 않았다.
    - `markdown.test.ts`: `1줄\n2줄`이 한 단락 안에 줄바꿈을 그대로 담는지 확인한다.
    - 브라우저: 모바일 390×844 미리보기에서 Enter로 나눈 세 줄이 세 줄(60px)로 보인다.
- 문제없음으로 확인된 항목: XSS 경로, CSS 선택자 변경, 백엔드 테스트의 동적 import, frontend가 없는 저장소에서의 건너뛰기, 접근성, docs 정확성
- 참고: 목록의 자르기는 줄 수가 아니라 높이(`max-height`) 기준이라 말줄임표가 없다(사소한 디자인 사항).
- 반영 후 `npm run check`: exit 0. tests 234, pass 217, fail 0, skipped 17(DB)
