// 매트릭스 비 효과 — 배경 캔버스에 떨어지는 문자
(function () {
  const canvas = document.getElementById("matrix-rain");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let cols, drops, fontSize;

  // 매트릭스 영화에서 쓰는 카타카나 + 숫자 + 일부 라틴 + 기호
  const charset =
    "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ" +
    "0123456789" +
    "!@#$%^&*()_+-={}[]|:;<>,.?/~`";
  const chars = charset.split("");

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    fontSize = Math.max(14, Math.round(window.innerWidth / 60));
    cols = Math.floor(canvas.width / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * canvas.height / fontSize));
  }
  resize();
  window.addEventListener("resize", resize);

  function draw() {
    // 배경을 살짝 어둡게 → 글자 잔상이 fade out
    ctx.fillStyle = "rgba(0, 8, 4, 0.075)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${fontSize}px "Courier New", "D2Coding", monospace`;

    for (let i = 0; i < cols; i++) {
      const ch = chars[(Math.random() * chars.length) | 0];
      const x = i * fontSize;
      const y = drops[i] * fontSize;

      // 끝부분(가장 앞 글자)은 더 밝은 흰빛-녹색
      ctx.fillStyle = Math.random() < 0.04 ? "#bdffce" : "#00ff52";
      ctx.fillText(ch, x, y);

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  // 너무 빠르지 않게 — 60ms ≈ 16fps 정도면 적당히 흐릿한 분위기
  setInterval(draw, 60);
})();
