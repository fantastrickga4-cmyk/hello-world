# Snake Matrix — 태블릿 2 (빨강 뷰어)

`D:/test/matrix`(태블릿 1)의 복제본. **기능·시나리오·힌트는 모두 동일**하고 다음 항목만 차이가 있다.

전체 기능 설명은 [matrix/README.md](../matrix/README.md) 참조.

## 차이점

| 항목 | 태블릿 1 (matrix) | 태블릿 2 (이 폴더) |
|---|---|---|
| 플레이어 URL | https://snake-matrix-pi.vercel.app | https://snake-matrix-2.vercel.app |
| 뷰어 URL | snake-matrix-pi.vercel.app/viewer.html | snake-matrix-2.vercel.app/viewer.html |
| **뷰어 색상 테마** | 파랑 (`#2a9fff`) | **빨강 (`#ff2a4d`)** |
| Vercel 프로젝트 | `snake-matrix` | `snake-matrix-2` |
| Redis 상태 키 | `snake-state` | `snake-state-t2` |
| Redis override 키 | `snake-timer-override` | `snake-timer-override-t2` |
| Service Worker 캐시 | `snake-matrix-vN` | `snake-matrix-2-vN` |

플레이어(메인 화면) 디자인은 매트릭스 그린으로 두 태블릿 모두 동일.

## 격리

- **상태**: Redis 키가 다르므로 두 태블릿이 같은 Upstash 인스턴스를 공유해도 서로 영향 없음
- **localStorage**: 도메인이 달라 자동 격리 (히스토리·타이머·메모·힌트 카운트 모두 독립)
- **SW 캐시**: 별도 캐시 이름이라 브라우저 캐시도 충돌 안 함

## 환경변수

태블릿 1과 동일한 Upstash Redis 인스턴스 사용. Vercel 프로젝트에 다음이 설정되어 있다:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

## 배포

```bash
cd D:/test/snake-matrix-2
vercel --prod --yes
```
