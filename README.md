# test

달력 + 회원가입/로그인이 가능한 게시판 + 관리자 페이지로 구성된 데모 프로젝트.

- 프로덕션: https://test-pink-one-27.vercel.app
- 깃허브: https://github.com/fantastrickga4-cmyk/hello-world
- 호스팅: Vercel (project `test`, team `fantastrickga4-9692s-projects`)

## 페이지

| 경로 | 설명 |
| --- | --- |
| `/` (`index.html`) | 이전/다음 달 이동, 오늘 날짜 강조가 있는 달력 |
| `/board.html` | 회원가입/로그인 후 글을 쓰고 본인 글을 삭제할 수 있는 게시판 |
| `/admin.html` | `ADMIN_USERNAMES` env에 등록된 사용자만 접근. 회원 목록 조회 + 사용자 삭제(작성글 동시 삭제) |

## 기술 스택

- 프런트엔드: 정적 HTML / CSS / Vanilla JS (빌드 단계 없음)
- 백엔드: Vercel Functions (Node.js 24, ESM)
- 저장소: Vercel Blob (`board` store, public access, 파일별 저장)
- 인증: `jose` JWT (HS256, 7일 만료) + `bcryptjs` 패스워드 해시

## 디렉터리 구조

```
.
├── index.html / style.css / script.js   # 달력
├── board.html / board.css / board.js    # 게시판
├── admin.html / admin.css / admin.js    # 관리자
├── api/
│   ├── _lib/
│   │   ├── auth.js       # JWT sign/verify, bcrypt, isAdmin
│   │   ├── storage.js    # Vercel Blob 헬퍼 (users/, posts/)
│   │   └── respond.js    # JSON 응답 / body 파서
│   ├── register.js       # POST  회원가입
│   ├── login.js          # POST  로그인
│   ├── me.js             # GET   현재 사용자 + isAdmin
│   ├── posts.js          # GET 목록 / POST 작성 / DELETE 삭제(?id=)
│   └── admin/
│       └── users.js      # GET 회원 목록 / DELETE 사용자(?username=)
├── package.json          # @vercel/blob, bcryptjs, jose
└── .gitignore            # .vercel, .env*.local, node_modules
```

저장소 레이아웃 (Vercel Blob):

- `users/<username>.json` — `{ username, passwordHash, createdAt }`
- `posts/<timestamp-random>.json` — `{ id, author, title, content, createdAt }`

## 환경 변수

Vercel 프로젝트에 설정되어 있고 로컬은 `vercel env pull .env.local` 로 가져올 수 있음.

| 이름 | 용도 |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob `board` store 액세스. Vercel API로 store↔project 연결 시 자동 생성 |
| `AUTH_SECRET` | JWT 서명 시크릿 (96 hex). 회전하면 모든 세션 무효화됨 |
| `ADMIN_USERNAMES` | 콤마 구분 관리자 아이디 목록. 현재 값: `admin` |

## 관리자 계정

스모크 테스트용으로 만들어둔 초기 admin 계정:

- 아이디: `admin`
- 비밀번호: `admin1234`

⚠️ 비밀번호를 바꾸거나(현재는 변경 API가 없으므로 삭제 후 재가입), 본인 아이디를
관리자로 추가하는 것을 권장. 관리자 추가 예:

```bash
vercel env add ADMIN_USERNAMES production --force   # 값에 "admin,my-id" 입력
vercel env add ADMIN_USERNAMES development --force
vercel deploy --prod --yes
```

## API

응답은 모두 JSON. 인증이 필요한 엔드포인트는 `Authorization: Bearer <token>` 헤더 필수.

### 인증
- `POST /api/register` — `{ username, password }` → `{ token, username }` (201)
  - username: 2~20자 영문/숫자/한글/언더스코어
  - password: 4자 이상
- `POST /api/login` — `{ username, password }` → `{ token, username }`
- `GET  /api/me` — `{ username, isAdmin }`

### 게시판
- `GET    /api/posts` — `{ posts: [...] }` (createdAt 내림차순)
- `POST   /api/posts` — `{ title, content }` → `{ post }` (로그인 필요)
- `DELETE /api/posts?id=<id>` — 본인 글 또는 관리자만 (로그인 필요)

### 관리자 (관리자만)
- `GET    /api/admin/users` — `{ users: [{ username, createdAt }, ...] }`
- `DELETE /api/admin/users?username=<u>` — 사용자 삭제, 작성글도 함께 제거. 자기 자신 삭제 불가

## 로컬 개발

```bash
npm install
vercel env pull .env.local --yes   # 환경변수 가져오기 (한 번)
vercel dev                         # 정적 + /api Functions 모두 핸들링
```

순수 정적 HTML 미리보기만 필요하면 `npx http-server -p 8000 -c-1` 도 가능하지만
`/api/*` 호출은 Vercel CLI(또는 배포본)가 있어야 동작.

## 배포

- `git push origin main` — GitHub 원격 (참조용; 자동 배포는 연결되어 있지 않음)
- `vercel deploy --prod --yes` — 프로덕션 배포 (현재 사용 중)

## 커밋 히스토리

```
a2b3c71 feat: add admin page with user management
9a966d7 feat: add auth-protected bulletin board
910a8cf style: change body background to red
c6b1b0a feat: add calendar with prev/next month and today highlight
59bc320 first commit: hello world html
```

## 알려진 한계 / 다음에 손볼 만한 것

- Blob store가 `public access`로 생성되어 있음. URL은 추측 불가능하지만 더 엄격하게
  하려면 private store + 서버 fetch에 인증 토큰 사용으로 전환 필요.
- 동일 username 동시 가입 같은 극단적 race는 막지 않음 (`allowOverwrite: false` 로 두번째가 실패).
- 비밀번호 변경 / 본인 탈퇴 / 글 수정 / 페이지네이션 / 검색 없음.
- 관리자 페이지는 사용자 목록만 다루고 글 일괄 삭제 UI는 없음 (게시판에서 한 건씩 삭제 가능).
- `vercel env add ADMIN_USERNAMES preview` 는 브랜치 인자 요구로 미설정. preview 배포가 필요해지면 별도 처리.
