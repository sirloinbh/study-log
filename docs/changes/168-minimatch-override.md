# #168 minimatch 취약점으로 인한 npm audit 16건 해결

- 이슈: [#168](https://github.com/sirloinbh/study-log/issues/168)
- 브랜치: `chore/168-minimatch-override`

## 목적

`npm audit`의 중간 등급 16건을 없앤다. 원인은 `minimatch` 10.2.6의 서비스 거부 취약점([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), 11.0.1 미만) 하나이고, 나머지 15건은 ESLint 계열로 번진 것이다. 운영 의존성에는 없었다.

## 변경

- `package.json`: `overrides`에 `minimatch` 11.0.3을 더했다.
- `package-lock.json`: `minimatch`가 11.0.3으로 바뀌고 `@isaacs/nonrecursive-glob-match` 1.0.3이 새로 들어왔다. 둘 다 `registry.npmjs.org`에서 오고 설치 스크립트가 없다.

`frontend`와 `backend`의 잠금 파일에는 `minimatch`가 없어 바뀌지 않는다. `.standards/manifest.json`이 관리하지 않는 필드라 이 저장소에서 고칠 수 있다.

## 구현 판단

- 게시 후 14일이 지나지 않은 버전을 피해 온 관행(#23, #49)의 예외이다. 수정 버전 11.0.1~11.0.3은 모두 2026-10-27~28 게시이고, 함께 들어온 `@isaacs/nonrecursive-glob-match` 1.0.3도 2026-10-28 게시이다. 사용자가 이 점을 안내받고 직접 설치했다.
- ESLint 계열은 `minimatch` `^10`을 요구하므로 주 버전을 넘겨 강제한다. 이들이 11을 공식 지원하면 override를 지운다.
- 패키지 설치는 사용자가 `--ignore-scripts`로 실행했다.

## 검증

- `npm audit`: 0건.
- `TEST_DATABASE_URL`을 설정한 `npm run check`: 백엔드 422건, 프런트 201건, 스킬 4건 통과. 건너뜀은 프런트 2건으로, 중앙 표준에서 온 다크 전용 앱 테스트이다.
- `npm run standards:check` 통과, 하위 잠금 파일이 루트와 같음.
- 린트가 조용히 멈추지 않는지 임시 파일로 확인하고 지웠다. `minimatch`는 ESLint가 설정의 `files`와 `ignores`를 맞추는 데 쓰기 때문이다.
  - `backend/src`와 `frontend/src`의 `.ts`: `simple-import-sort/imports`, `@typescript-eslint/require-await`, `no-var`, `@typescript-eslint/no-unused-vars`를 잡았다.
  - `.tsx`: `react-hooks/exhaustive-deps`, `jsx-a11y-x/alt-text`를 잡았다.
  - 빌드 결과인 `frontend/dist`의 파일은 검사하지 않았다.
  - 임시 파일을 뺀 192개 파일에 새 문제는 없었다.

앱 코드를 바꾸지 않아 브라우저 확인은 하지 않았다. 바뀐 패키지는 개발 도구에서만 쓰인다.

## 리뷰

1차 리뷰에서 동작 결함은 없었다. ESLint 계열 네 패키지가 쓰는 `Minimatch`, `minimatch`, `match`, `dot`, `flipNegate`는 11.0.3에 그대로 있고, 없어진 API(`makeRe`, `AST` 등)는 쓰지 않는다. 문서의 파일 수와 새 패키지의 게시일 누락을 고쳤다.
