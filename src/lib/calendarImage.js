const { createCanvas } = require('@napi-rs/canvas');
const { DateTime } = require('luxon');

const CELL_W = 64;
const CELL_H = 52;
const HEADER_H = 40;
const TITLE_H = 48;
const PADDING = 12;
const COLS = 7;
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Colors
const BG = '#1e1f22';           // Discord dark background
const GRID_LINE = '#2b2d31';    // Subtle grid lines
const TEXT = '#dcddde';         // Normal text
const HEADER_TEXT = '#ffffff';   // Month title
const DOW_TEXT = '#b5bac1';     // Day-of-week headers
const EVENT_BG = '#5865f2';     // Blurple for event days
const EVENT_TEXT = '#ffffff';    // White text on event days
const TODAY_BORDER = '#57f287'; // Green border for today

/**
 * Render a calendar month as a PNG buffer.
 * @param {object} opts
 * @param {number} opts.year
 * @param {number} opts.month
 * @param {Set<number>} opts.eventDays - set of day numbers that have events
 * @param {string} opts.timezone
 * @returns {Buffer} PNG image buffer
 */
function renderCalendarImage({ year, month, eventDays, timezone }) {
  const zone = timezone || 'America/New_York';
  const monthStart = DateTime.fromObject({ year, month, day: 1 }, { zone });
  const monthName = monthStart.toFormat('LLLL yyyy');
  const daysInMonth = monthStart.daysInMonth;
  const startDow = monthStart.weekday; // 1=Mon, 7=Sun

  const rows = Math.ceil((daysInMonth + startDow - 1) / 7);
  const width = PADDING * 2 + COLS * CELL_W;
  const height = PADDING * 2 + TITLE_H + HEADER_H + rows * CELL_H;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = HEADER_TEXT;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(monthName, width / 2, PADDING + 30);

  // Day-of-week headers
  ctx.fillStyle = DOW_TEXT;
  ctx.font = 'bold 14px sans-serif';
  const gridTop = PADDING + TITLE_H;
  for (let col = 0; col < COLS; col++) {
    const x = PADDING + col * CELL_W + CELL_W / 2;
    ctx.fillText(DOW_LABELS[col], x, gridTop + 24);
  }

  // Today's date for highlighting
  const today = DateTime.now().setZone(zone);
  const isThisMonth = today.year === year && today.month === month;
  const todayDay = isThisMonth ? today.day : -1;

  // Day cells
  const cellsTop = gridTop + HEADER_H;
  let col = startDow - 1; // 0-indexed column
  let row = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const x = PADDING + col * CELL_W;
    const y = cellsTop + row * CELL_H;
    const hasEvent = eventDays.has(day);

    // Cell background for event days
    if (hasEvent) {
      ctx.fillStyle = EVENT_BG;
      roundRect(ctx, x + 2, y + 2, CELL_W - 4, CELL_H - 4, 6);
      ctx.fill();
    }

    // Today border
    if (day === todayDay) {
      ctx.strokeStyle = TODAY_BORDER;
      ctx.lineWidth = 2;
      roundRect(ctx, x + 2, y + 2, CELL_W - 4, CELL_H - 4, 6);
      ctx.stroke();
    }

    // Day number
    ctx.fillStyle = hasEvent ? EVENT_TEXT : TEXT;
    ctx.font = hasEvent ? 'bold 18px sans-serif' : '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(day), x + CELL_W / 2, y + CELL_H / 2 + 6);

    col++;
    if (col >= 7) {
      col = 0;
      row++;
    }
  }

  // Grid lines (subtle)
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    const y = cellsTop + r * CELL_H;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(width - PADDING, y);
    ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    const x = PADDING + c * CELL_W;
    ctx.beginPath();
    ctx.moveTo(x, cellsTop);
    ctx.lineTo(x, cellsTop + rows * CELL_H);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

// Helper: draw a rounded rectangle path.
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = { renderCalendarImage };
