# 공부 기록 PostgreSQL

PostgreSQL 17. 마이그레이션 원본은 `migrations/NNN_<설명>.sql` 한 곳뿐이다. 빈 Docker 볼륨에서는 최초 실행 시 모든 파일이 이름순으로 자동 적용되고, CI도 모든 파일을 순서대로 적용한다.

기존 DB에는 적용 도구로 아직 적용하지 않은 파일만 적용한다. 배포(`deploy/remote-deploy.sh`)는 새 버전을 띄우기 전에 `node dist/migrate.js`로 같은 일을 하고, 실패하면 멈춘다.

```powershell
npm run db:migrate -w backend
```

저장소 루트의 `.env`에 있는 `DATABASE_URL`을 쓴다. 적용 기록은 `schema_migrations` 표에 남는다.

- 파일과 기록은 함께 커밋된다. 실패하면 그 파일만 되돌리고 멈추며, 앞선 파일의 기록은 남는다.
- 적용한 파일을 고치거나 지우면 적용을 거부한다. 고칠 내용은 새 번호의 파일로 쓴다.
- 이 표가 생기기 전에 파일을 직접 적용한 DB는 첫 실행 때 모든 파일을 한 번 더 실행한다. 아래 규칙대로 재실행해도 안전하기 때문이다.

컨테이너의 파일을 직접 적용해야 할 때는 `psql -f`를 쓴다. `Get-Content … | docker compose exec … psql`처럼 PowerShell 파이프로 넘기지 않는다. Windows PowerShell 5.1은 외부 프로그램으로 ASCII를 보내 한글이 `?`로 깨진다.

규칙: 모든 마이그레이션은 재실행해도 안전하게 쓴다. 병렬 브랜치는 착수 시 번호를 예약한다. 기존 데이터의 의미를 보존하고, 확인하지 못한 값은 NULL로 둔다. SQL의 한글 리터럴은 가능하면 `U&'\\XXXX'` 이스케이프를 쓴다.
