# Snake Matrix — 방탈출 통신 채널 (태블릿 1)

방탈출 게임 운영용 메신저 스타일 코드 입력 프로그램. 플레이어가 태블릿에 코드를 입력하면 "본사(SNAKE)"가 메시지 버블로 응답하는 형태. PC 운영자는 별도 뷰어(`viewer.html`)로 실시간 상태를 모니터링하고 타이머를 원격 제어한다.

## 배포 / 접속

| 역할 | URL |
|---|---|
| 플레이어 (태블릿) | https://snake-matrix-pi.vercel.app |
| 운영자 뷰어 (PC) | https://snake-matrix-pi.vercel.app/viewer.html |
| Vercel 프로젝트 | `snake-matrix` |

태블릿 2는 별도 폴더 `D:/test/snake-matrix-2/`에 동일 코드 + 빨간 톤 뷰어로 복제되어 있다 (자세한 내용은 그쪽 README 참조).

## 주요 기능

### 1. 본사 통신 시나리오 (`scenario.js`)
- `transmissions[]`: 코드 → 응답 메시지 매핑 (`play ep`, `bar lust`, `lu637`, ... `cu next ep`)
- 각 응답은 줄(line) 단위 버블, 일부는 이미지 첨부
- `progressPercent` 필드로 진행률 % 자동 갱신
- 특수 코드:
  - `play ep`: 카운트다운 타이머 시작 (1시간 40분)
  - `bar lust`: 타이머 활성화 후에만 동작
  - `cu next ep`: 메시지 대신 EP1 CLEAR 오버레이, 타이머 동결, 진행률 100%
  - `fan1102`: 모든 상태 즉시 초기화

### 2. 힌트 시스템 (`SCENARIO.hints`)
- 메인 입력란에 `힌트` 입력 또는 `[힌트]` 버튼 → 모달 오픈
- 30개 PE 코드 (`PE000`~`PE030`, 12·15·17 일부 제외) — ProjectEve Unity 번들에서 추출
- 각 코드: 1차 힌트(전문) + 정답 (있을 때만 토글로 노출)
- 22/30개에 정답 토글, 8개는 [보조] 텍스트로 통합
- 힌트 사용 횟수 카운터 (모달 + 뷰어 표시)
- 미존재 코드: "없는 힌트코드입니다…"

### 3. 메모장 / 낙서판
- 입력창의 `[메모]` 버튼 (힌트 버튼 옆)
- 캔버스 기반 모달 (최대 920×1100)
- PEN / ERASE, 4색 (그린·앰버·레드·화이트), CLEAR (즉시 실행)
- localStorage(`snake-matrix-memo-v1`)에 PNG dataURL 저장
- pointer events + `touch-action: none` (터치 자연스럽게)
- 회전·리사이즈 시 그림 보존하며 재배치

### 4. 타이머
- 시작: `play ep` 입력 (1시간 40분 기본값)
- 동결: `cu next ep` 입력 시 현재 잔여 시간 박제
- **오버타임 진행**: 0초 도달 후 멈추지 않고 음수로 흘러감 (`-00:01:30` 형식, 빨간 UI 유지). 알람은 0 통과 시 1회 재생
- `cu next ep`가 음수 시점에 들어와도 그 음수 값 그대로 freeze
- 색상 단계: 정상(녹) → 10분(앰버) → 5분(레드) → 1분(blink) → 0이하(레드 배경 + " :: TIME UP")

### 5. 운영자 뷰어 (`viewer.html`)
PC 브라우저로 열면 태블릿 상태를 2초마다 폴링하여 표시:
- T-MINUS (잔여 시간) — 음수도 표시
- SYNC (진행률 %)
- LAST INPUT (최근 입력 코드)
- REPLY (마지막 응답 1건)
- HINT USED (힌트 사용 횟수)
- **EDIT TIMER**: 분 단위로 타이머 강제 변경 → 플레이어 4초 내 동기화

색상 테마: 파랑 (`#2a9fff` 액센트). 메인 플레이어는 매트릭스 그린 유지.

### 6. PWA / 캐시
- Service Worker가 모든 정적 자원 stale-while-revalidate
- `controllerchange` 이벤트 시 자동 reload — `sw.js`의 `CACHE_NAME` 버전만 올리면 다음 진입 시 새 코드 적용
- 오프라인 지원 (캐시 fallback)

### 7. 화면 세로 고정
태블릿이 가로로 회전돼도 portrait 강제 잠금 시도 (지원 브라우저에서만)

## 디렉터리 구조

```
matrix/
├── index.html          # 플레이어 메인 화면
├── app.js              # 메인 로직 (입력 처리, 렌더, 메모, 타이머 폴링 등)
├── scenario.js         # 코드 시나리오 + 힌트 데이터
├── timer.js            # SnakeTimer 모듈 (start/freeze/setRemaining/clear)
├── style.css           # 매트릭스 사이버펑크 테마 + 모달들
├── matrix-rain.js      # 배경 매트릭스 비 캔버스
├── sw.js               # Service Worker (캐시 + 자동 갱신)
├── manifest.json       # PWA 매니페스트
├── icon.svg            # 앱 아이콘
├── viewer.html         # PC 운영자 뷰어 (단일 파일, 인라인 CSS/JS)
├── viewer.js           # 뷰어 로직 (폴링, 타이머 편집)
├── api/
│   ├── state.js              # POST/GET 상태 (Redis key: snake-state)
│   └── timer-override.js     # POST/GET 타이머 override (Redis key: snake-timer-override)
├── er397.png, pc015.png      # 시나리오 첨부 이미지
└── sound-samples/            # 사운드 톤 샘플 (참조용, 런타임 미사용)
```

## 환경변수 (Vercel)

API는 Upstash Redis(KV) 사용. `vercel env ls`로 확인 가능.

- `KV_REST_API_URL` (or `UPSTASH_REDIS_REST_URL`)
- `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_TOKEN`)
- `KV_REST_API_READ_ONLY_TOKEN` (선택)

태블릿 2(snake-matrix-2)도 같은 Upstash 인스턴스를 공유하지만 키 prefix(`-t2`)로 상태 격리됨.

## 빌드 / 배포

순수 정적 사이트 + 서버리스 함수 (Vercel). 빌드 단계 없음.

```bash
# 변경 후 production 배포
cd D:/test/matrix
vercel --prod --yes

# 새 코드를 즉시 적용하려면 sw.js의 CACHE_NAME 버전을 올린 뒤 배포
# (controllerchange 핸들러가 사용자 브라우저를 자동 reload)
```

## localStorage 키

| Key | 내용 |
|---|---|
| `snake-messenger-history-v1` | 채팅 히스토리 (배열) |
| `snake-messenger-progress-v1` | 진행률 % (0~100) |
| `snake-timer-state-v1` | `{ startTs, durationMs, frozen, frozenMs }` |
| `snake-hint-count-v1` | 힌트 사용 횟수 |
| `snake-matrix-memo-v1` | 메모장 PNG dataURL |
| `snake-timer-override-applied-ts` | 마지막 적용한 viewer override 시각 |
| `snake-last-sync-v1` | 마지막 캐시 갱신 요청 시각 |

## 관리자 트리거

- 좌측 하단 보이지 않는 영역 **3초 길게 누르면** 모든 상태 초기화 (확인 다이얼로그)
- 입력란에 `fan1102` 입력해도 동일 (확인 없이 즉시)

## 작업 히스토리

날짜는 작업 진행 순서. 자세한 변경은 git 히스토리 또는 Vercel 배포 로그 참조.

1. **힌트 추출**: `first/hint`의 Unity APK 번들(`data.unity3d`)을 UnityPy로 풀어서 30개 PE 코드 + 메시지 + 정답 추출
2. **scenario.js 통합**: 추출한 30개 PE 힌트를 `SCENARIO.hints`로 적용. TextMeshPro 태그(`<cspace>`, `<size>`, `<b>`) 제거
3. **정답 토글 UI**: `index.html`에 `[정답 보기]` 버튼 + 앰버 톤 박스. `app.js`에서 `{hint, answer}` 객체 형식 지원
4. **메모장 추가**: 힌트 버튼 옆 `[메모]` 버튼. 캔버스 모달 + 펜·지우개·색상·CLEAR
5. **viewer 타이머 편집**: `/api/timer-override` 엔드포인트 신설. 뷰어에 분 입력 폼. 플레이어 4초 폴링하여 자동 적용
6. **타이머 오버타임**: `Math.max(0, ...)` 클램프 제거. 0초 후에도 음수로 진행, 빨간 UI 유지
7. **힌트 메시지 정제**: Unity 패널 강제 줄바꿈 흔적 제거. 단어 중간 분리 ("상태\n로") 합침. 가독성 위한 쉼표 미세 조정
8. **반응 속도 조정**: 코드 입력 → 응답 280ms→180ms, 라인 타이핑 450~1100ms→280~700ms, 모달 애니메이션 0.18s→0.14s 등 (현재 기본 빠름·옛 속도 사이 중간값)
9. **불필요한 옛 프로젝트 정리**: `first/`(snake-terminal), `snake-2/`(snake-terminal-2) 로컬 폴더 + Vercel 프로젝트 삭제
10. **태블릿 2 복제**: `snake-matrix-2/` 폴더로 복제, Redis 키 분리, 뷰어를 빨간 톤으로 변경, 별도 Vercel 프로젝트로 배포
11. **상단 UI 재배치**: 우측 상단에 적층돼 있던 타이머/진행률을 분리 — 진행률은 우측 상단(데스크톱 170px / 모바일 110px), 타이머는 화면 가로 중앙(240px / 모바일 200px)에 배치. `.msg-header`에 `min-height: 116px`(모바일 96px) 추가하여 헤더 하단 가로줄이 중앙 타이머 박스 바닥에 정렬되도록 조정. 양쪽 태블릿 동일 적용.
