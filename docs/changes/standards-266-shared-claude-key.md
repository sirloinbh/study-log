# 공용 Claude API 키를 project-standards/.env에서 읽기 (sirloinbh/project-standards#266)

## 목적

공용 Claude API 키를 앱마다 `.env`에 넣지 않고 PC의 `project-standards/.env` 한 곳에 둔다(project-standards ADR-0010 변경, 2026-10-29 사용자 결정).

## 변경

- `backend/package.json`의 `dev`: `../.env` 다음에 `../../project-standards/.env`도 읽는다. 앱 클론이 project-standards와 같은 상위 폴더에 있다고 본다. 파일이 없으면 건너뛴다.
- 같은 키가 두 파일에 있으면 뒤에 읽는 `project-standards/.env`가 이긴다. 그래서 `.env`에 남은 빈 `ANTHROPIC_API_KEY=` 줄이 공용 키를 덮지 않는다.
- `.env.example`: 로컬에서는 키를 비워 두라는 설명 추가.

## 키 넣기

project-standards에서 `node tools/app-secrets.mjs pull`을 실행한다(개인 AWS 프로필 필요).
