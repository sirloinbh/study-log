# #121 목차 순서 바꾸기 ids 배열에 길이 제한

이슈: https://github.com/sirloinbh/study-log/issues/121

## 목적

zod 3 보안 권고 GHSA-mrhx-c7xc-m3w5(high)는 길이 제한 없는 배열 검증으로 메모리를 바닥낼 수 있다. zod 3에는 고친 버전이 없다. 이 앱에서 길이 제한이 없던 배열은 목차 순서 바꾸기의 `ids` 하나였다(sirloinbh/project-standards#326).

## 변경

- `backend/src/textbook-contents.ts`: `orderLimit = 1000`, `ids`에 `.max(orderLimit, '목차 순서는 한 번에 1000개까지 바꿀 수 있습니다')`
- `backend/test/textbook-contents.test.ts`: 1001개를 보내면 `400`과 위 메시지

한도 1000은 한 번에 붙여 넣는 목차 한도(500개)의 두 배다. 한 교재의 같은 단계 목차가 이보다 많을 일은 없다고 보았다.

## 검증

- `tsx --test test/textbook-contents.test.ts`: 4개 통과
- `textbook-contents.ts`를 TypeScript `strict`·`NodeNext`로 타입 검사: 오류 없음
- 두 파일을 공유 ESLint·Prettier 설정으로 검사: 문제 없음
- 이 PC에는 `@sirloinbh/*` 패키지가 설치돼 있지 않아 `npm run check` 전체는 실행하지 못했다. CI에서 확인한다.
