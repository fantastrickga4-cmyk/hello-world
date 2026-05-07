// Service worker — 오프라인 우선 + 온라인 시 백그라운드 갱신 (stale-while-revalidate)
//
// 동작:
//  1. 모든 요청은 먼저 캐시에서 즉시 응답 (빠름, 오프라인 동작)
//  2. 동시에 네트워크 fetch (온라인 한정) → 캐시 갱신
//  3. 다음 실행 시 새 캐시 사용 → 사용자가 와이파이 만났을 때 자동 동기화
//
// 결과: 태블릿이 잠깐 와이파이에 연결되기만 하면 새 시나리오·이미지·코드가 자동으로 받아짐.

const CACHE_NAME = "snake-matrix-2-v5";
const FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./scenario.js",
  "./timer.js",
  "./matrix-rain.js",
  "./icon.svg",
  "./manifest.json",
  "./er397.png",
  "./pc015.png",
  "./viewer.html",
  "./viewer.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(FILES).catch((err) => {
        console.warn("[sw] cache addAll failed (일부 파일 누락 가능):", err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;   // 외부 자원은 통과
  if (url.pathname.startsWith("/api/")) return; // API는 항상 네트워크 직통 (캐시 X)

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);

      // 백그라운드 네트워크 fetch (온라인일 때만 의미 있음, 실패 무시)
      const networkPromise = fetch(event.request)
        .then((res) => {
          if (res && res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // 캐시 즉시 반환 (네트워크 갱신은 백그라운드)
        event.waitUntil(networkPromise);
        return cached;
      }
      // 캐시 미스 — 네트워크 또는 fallback
      const networked = await networkPromise;
      return networked || (await cache.match("./index.html"));
    })
  );
});

// 페이지에서 "지금 강제 갱신" 메시지를 받으면 모든 핵심 자원을 다시 fetch
self.addEventListener("message", (event) => {
  if (event.data === "refresh-cache") {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) =>
        Promise.all(FILES.map((f) => fetch(f, { cache: "no-store" })
          .then((res) => res.ok && cache.put(f, res))
          .catch(() => {}))
        )
      )
    );
  }
});
