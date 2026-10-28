// A drifting network of glowing nodes joined by faint lines, drawn on a 2D canvas.
// Kept separate from React so the drawing logic is easy to test on its own.

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  violet: boolean;
  glow: boolean;
}

export interface Network {
  resize: (width: number, height: number, dpr: number) => void;
  step: () => void;
  draw: () => void;
}

const LINK_DISTANCE = 135;
const MIN_NODES = 48;
const MAX_NODES = 130;

function makeNode(w: number, h: number): Node {
  const glow = Math.random() < 0.22;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    r: glow ? 2.2 + Math.random() * 1.6 : 1 + Math.random() * 1.2,
    violet: Math.random() < 0.14,
    glow,
  };
}

export function createNetwork(canvas: HTMLCanvasElement): Network | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let w = 0;
  let h = 0;
  let nodes: Node[] = [];

  const resize = (width: number, height: number, dpr: number) => {
    w = width;
    h = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Node count follows screen area so phones stay smooth.
    const target = Math.round(Math.min(MAX_NODES, Math.max(MIN_NODES, (w * h) / 5500)));
    nodes = nodes.slice(0, target);
    while (nodes.length < target) nodes.push(makeNode(w, h));
    nodes.forEach((n) => {
      n.x = Math.min(n.x, w);
      n.y = Math.min(n.y, h);
    });
  };

  const step = () => {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -10) n.x = w + 10;
      else if (n.x > w + 10) n.x = -10;
      if (n.y < -10) n.y = h + 10;
      else if (n.y > h + 10) n.y = -10;
    }
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);

    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx > LINK_DISTANCE || dx < -LINK_DISTANCE) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > LINK_DISTANCE) continue;
        ctx.strokeStyle = `rgba(0, 212, 255, ${(1 - dist / LINK_DISTANCE) * 0.45})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    for (const n of nodes) {
      const color = n.violet ? '168, 85, 247' : '0, 212, 255';
      if (n.glow) {
        ctx.fillStyle = `rgba(${color}, 0.14)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${color}, ${n.glow ? 0.95 : 0.7})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  return { resize, step, draw };
}
