const titleEl = document.getElementById("title");
const daysEl = document.getElementById("days");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const todayBtn = document.getElementById("today-btn");

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function render() {
  titleEl.textContent = `${viewYear}년 ${viewMonth + 1}월`;
  daysEl.innerHTML = "";

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalCells = Math.ceil((startWeekday + lastDay.getDate()) / 7) * 7;
  const firstCellDate = new Date(viewYear, viewMonth, 1 - startWeekday);

  for (let i = 0; i < totalCells; i++) {
    const date = new Date(firstCellDate);
    date.setDate(firstCellDate.getDate() + i);

    const classes = [];
    if (date.getMonth() !== viewMonth) classes.push("other-month");
    const weekday = date.getDay();
    if (weekday === 0) classes.push("sun");
    if (weekday === 6) classes.push("sat");
    if (isSameDay(date, today)) classes.push("today");

    const cell = document.createElement("div");
    cell.className = ["day", ...classes].join(" ");
    cell.textContent = date.getDate();
    daysEl.appendChild(cell);
  }
}

prevBtn.addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear--;
  }
  render();
});

nextBtn.addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear++;
  }
  render();
});

todayBtn.addEventListener("click", () => {
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  render();
});

render();
