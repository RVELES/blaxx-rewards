// ============================================================
// BLAXX App · Design Kit
// Tokens, icons, primitives, TabBar, BlaxxCard, PointsChart
// Exports to window for use in screen files.
// ============================================================

const BX = {
  bg: '#0A0B07', bg2: '#0E100A',
  surf: '#15170E', surf2: '#1B1E13', surfHi: '#23271A',
  line: 'rgba(244,246,238,0.09)', line2: 'rgba(244,246,238,0.16)',
  lime: '#AEE63A', limeBright: '#C6F833', limeDeep: '#8DBF2C',
  ink: '#0A0B07',
  fg: '#F2F4EA', muted: '#9DA68A', subtle: '#6B7058',
  pos: '#9BE25A', neg: '#FF7256', warn: '#F0B83E', info: '#6AA4FF',
  mono: "'JetBrains Mono', ui-monospace, monospace",
  display: "'Hanken Grotesk', system-ui, sans-serif",
  limeGlow: '0 12px 34px rgba(174,230,58,0.28)',
};

// ----- Icons (stroke) -----
const PATHS = {
  home: 'M3 10.8 12 3l9 7.8M5.4 9.5V20h13.2V9.5M9.5 20v-5.2h5V20',
  wallet: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2H5.5M3 7.5V18a2.5 2.5 0 0 0 2.5 2.5H19A2 2 0 0 0 21 18.5V10a2 2 0 0 0-2-2H5.5M16.5 13.8h.01',
  gift: 'M4 11h16v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19zM3 8.2A1.7 1.7 0 0 1 4.7 6.5H19.3A1.7 1.7 0 0 1 21 8.2V11H3zM12 6.5V20.5M12 6.5C9.5 6.5 7.5 3 9.4 2.4 10.8 2 12 4.4 12 6.5c0-2.1 1.2-4.5 2.6-4.1C16.5 3 14.5 6.5 12 6.5Z',
  send: 'M20.5 3.5 3.2 10.4c-1 .4-1 1.8.1 2l6.4 1.5 1.5 6.5c.2 1 1.6 1.1 2 .1L20.5 3.5ZM20.5 3.5 10 14.2',
  user: 'M12 12.2a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4ZM5 20c0-3.7 3.1-5.6 7-5.6s7 1.9 7 5.6',
  bell: 'M6 16.5V10a6 6 0 0 1 12 0v6.5l1.6 2.3H4.4ZM9.7 19.2a2.4 2.4 0 0 0 4.6 0',
  plus: 'M12 5v14M5 12h14',
  chart: 'M4 20V4M4 20h16M8 16.5v-4M12.5 16.5v-8M17 16.5v-5.5',
  fire: 'M12 3c.5 3-2.5 4-2.5 7.2A2.6 2.6 0 0 0 12 13a2.4 2.4 0 0 0 2.2-3.4C16 11 17 12.8 17 15a5 5 0 0 1-10 0c0-3 2.5-4 2.5-7 0-2 1-3.5 2.5-5Z',
  star: 'M12 3.5l2.5 5.1 5.6.8-4 4 1 5.6L12 21.5l-5 2.6.95-5.6-4-4 5.6-.8Z',
  check: 'M5 12.5l4.5 4.5L19 7',
  chevR: 'M9 5l7 7-7 7',
  chevL: 'M15 5l-7 7 7 7',
  arrowUp: 'M12 19V5M5.5 11.5 12 5l6.5 6.5',
  arrowDown: 'M12 5v14M5.5 12.5 12 19l6.5-6.5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12.4a.4.4 0 1 0 0-.8.4.4 0 0 0 0 .8Z',
  heart: 'M12 20.5S3.5 14.8 3.5 9.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.2C20.5 14.8 12 20.5 12 20.5Z',
  share: 'M16 8.5a2.7 2.7 0 1 0-2.6-3.3L8.9 7.6a2.7 2.7 0 1 0 0 4.8l4.5 2.4a2.7 2.7 0 1 0 .8-1.7L9.7 10.7a2.7 2.7 0 0 0 0-1.4l4.5-2.4A2.7 2.7 0 0 0 16 8.5Z',
  lock: 'M6.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5M5.5 10.5h13A1.5 1.5 0 0 1 20 12v7.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5V12a1.5 1.5 0 0 1 1.5-1.5Z',
  sparkle: 'M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6ZM18.5 14l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z',
  crown: 'M4 17.5h16M4 17.5 3 7l5 4 4-6.5L16 11l5-4-1 10.5Z',
  coins: 'M9 11.6c3 0 5.5-1.2 5.5-2.6S12 6.4 9 6.4 3.5 7.6 3.5 9 6 11.6 9 11.6ZM3.5 9v4c0 1.4 2.5 2.6 5.5 2.6M14.5 11.5C17 11.6 19 12.7 19 14s-2.5 2.6-5.5 2.6S8 15.4 8 14M8 14v3.5c0 1.4 2.5 2.6 5.5 2.6S19 18.9 19 17.5V14',
  close: 'M6 6l12 12M18 6 6 18',
  shield: 'M12 3 5 6v6c0 4.3 3 7.2 7 9 4-1.8 7-4.7 7-9V6ZM9.2 12l2 2 3.6-3.8',
  ticket: 'M4 7.5h16v2.8a1.7 1.7 0 0 0 0 3.4v2.8H4v-2.8a1.7 1.7 0 0 0 0-3.4ZM14 7.5v9',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  bolt: 'M13 2 4 13.5h6L11 22l9-11.5h-6Z',
  copy: 'M9 9h9.5A1.5 1.5 0 0 1 20 10.5V20a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 20v-9.5A1.5 1.5 0 0 1 9 9ZM7.5 15H5.5A1.5 1.5 0 0 1 4 13.5V4A1.5 1.5 0 0 1 5.5 2.5H15A1.5 1.5 0 0 1 16.5 4v2',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A2 2 0 1 1 7.3 3.6l.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V2.4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4H21a1.6 1.6 0 0 0-1.5 1Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5',
  card: 'M3 7.5A2 2 0 0 1 5 5.5h14a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M6.5 15.5h4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM20 14v6M17 20h3',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  apple: 'M16 13c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8s-1.7-.8-2.9-.8C7 8 5.6 9 4.9 10.4c-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.9.7 1.9-1 2.6-2c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.2-.9-2.2-3.4ZM13.9 6.8c.6-.7 1-1.7.9-2.8-.9 0-1.9.6-2.5 1.3-.6.6-1 1.7-.9 2.7 1 .1 2-.5 2.5-1.2Z',
  google: 'M21 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7.1ZM12 21.5c2.4 0 4.5-.8 6-2.2l-3.1-2.4c-.8.6-1.9.9-2.9.9-2.3 0-4.2-1.5-4.9-3.6H3.9v2.5A9 9 0 0 0 12 21.5ZM7.1 14.2a5.4 5.4 0 0 1 0-3.4V8.3H3.9a9 9 0 0 0 0 8.1ZM12 6.7c1.3 0 2.4.5 3.3 1.3l2.5-2.5A8.6 8.6 0 0 0 12 3a9 9 0 0 0-8.1 5l3.2 2.5C7.8 8.2 9.7 6.7 12 6.7Z',
};
function Icon({ name, size = 22, color = 'currentColor', sw = 1.8, fill = false, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'}
      stroke={fill ? 'none' : color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={PATHS[name]} />
    </svg>
  );
}

// ----- tiny helpers -----
const fmt = n => n.toLocaleString('pt-BR');
function Mono({ children, style }) { return <span style={{ fontFamily: BX.mono, ...style }}>{children}</span>; }

function Chip({ children, active, color, onlight }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: BX.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', padding: '6px 12px', borderRadius: 999,
      background: active ? BX.lime : (color || 'rgba(244,246,238,0.06)'),
      color: active ? BX.ink : BX.muted,
      border: active ? 'none' : `1px solid ${BX.line}`,
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Eyebrow({ children, icon }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: BX.mono, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: BX.lime,
      background: 'rgba(174,230,58,0.12)', border: '1px solid rgba(174,230,58,0.34)',
      padding: '5px 10px', borderRadius: 999,
    }}>
      {icon && <Icon name={icon} size={12} color={BX.lime} sw={2} />}
      {children}
    </span>
  );
}

function Btn({ children, kind = 'primary', icon, block, sm, onClick, style }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    fontFamily: BX.display, fontWeight: 800, fontSize: sm ? 14 : 16,
    padding: sm ? '11px 18px' : '15px 22px', borderRadius: 999, border: '1px solid transparent',
    width: block ? '100%' : undefined, cursor: 'pointer', letterSpacing: '-0.01em',
    WebkitTapHighlightColor: 'transparent',
  };
  const kinds = {
    primary: { background: BX.lime, color: BX.ink, boxShadow: BX.limeGlow },
    dark: { background: BX.surf2, color: BX.lime, border: `1px solid rgba(174,230,58,0.34)` },
    ghost: { background: 'rgba(244,246,238,0.06)', color: BX.fg, border: `1px solid ${BX.line2}` },
    outline: { background: 'transparent', color: BX.fg, border: `1px solid ${BX.line2}` },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...kinds[kind], ...style }}>
      {icon && <Icon name={icon} size={sm ? 16 : 19} color={kind === 'primary' ? BX.ink : 'currentColor'} sw={2.1} />}
      {children}
    </button>
  );
}

function Card({ children, style, pad = 16, soft }) {
  return (
    <div style={{
      background: soft ? 'rgba(244,246,238,0.04)' : BX.surf,
      border: `1px solid ${BX.line}`, borderRadius: 20, padding: pad, ...style,
    }}>{children}</div>
  );
}

function Avatar({ initial, size = 38, lime }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: lime ? BX.lime : 'rgba(244,246,238,0.08)',
      color: lime ? BX.ink : BX.fg, display: 'grid', placeItems: 'center',
      fontWeight: 800, fontSize: size * 0.4, border: lime ? 'none' : `1px solid ${BX.line}`,
    }}>{initial}</div>
  );
}

function ProgressBar({ value, h = 9, glow }) {
  return (
    <div style={{ height: h, borderRadius: 999, background: 'rgba(244,246,238,0.10)', overflow: 'hidden' }}>
      <div style={{
        width: value + '%', height: '100%', borderRadius: 999,
        background: `linear-gradient(90deg, ${BX.limeDeep}, ${BX.lime}, ${BX.limeBright})`,
        boxShadow: glow ? '0 0 12px rgba(174,230,58,0.5)' : 'none',
      }} />
    </div>
  );
}

// ----- App top bar (greeting / title) -----
function AppHeader({ title, sub, leadAvatar, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      {leadAvatar && <Avatar initial={leadAvatar} size={44} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        {sub && <div style={{ fontFamily: BX.mono, fontSize: 11, color: BX.muted, letterSpacing: '0.04em', marginBottom: 2 }}>{sub}</div>}
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>{title}</div>
      </div>
      {action}
    </div>
  );
}

function IconBtn({ name, badge, onClick, lime }) {
  return (
    <button onClick={onClick} style={{
      position: 'relative', width: 42, height: 42, borderRadius: '50%',
      background: lime ? BX.lime : 'rgba(244,246,238,0.06)',
      border: `1px solid ${lime ? 'transparent' : BX.line2}`,
      display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0,
      WebkitTapHighlightColor: 'transparent',
    }}>
      <Icon name={name} size={20} color={lime ? BX.ink : BX.fg} sw={1.9} />
      {badge && <span style={{
        position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: '50%',
        background: BX.lime, border: `2px solid ${BX.bg}`,
      }} />}
    </button>
  );
}

// ============================================================
// BLAXX loyalty card (hero visual)
// ============================================================
function BlaxxCard({ name = 'Ricardo Veles', tier = 'PLUS', points = 32480, number = '4821', compact }) {
  return (
    <div style={{
      position: 'relative', borderRadius: 24, overflow: 'hidden',
      padding: compact ? 18 : 20, aspectRatio: compact ? undefined : '1.62 / 1',
      background: `radial-gradient(120% 130% at 88% 8%, rgba(174,230,58,0.30), transparent 52%), radial-gradient(90% 80% at 0% 110%, rgba(174,230,58,0.10), transparent 55%), linear-gradient(160deg, #1A1D12, #0B0C08 78%)`,
      border: '1px solid rgba(174,230,58,0.22)',
      boxShadow: '0 18px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      {/* etched lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cstroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="rgba(174,230,58,0.0)" />
            <stop offset="1" stopColor="rgba(174,230,58,0.18)" />
          </linearGradient>
        </defs>
        <path d="M-20 60 L380 -40" stroke="url(#cstroke)" strokeWidth="40" fill="none" />
        <path d="M-20 120 L420 -10" stroke="rgba(244,246,238,0.04)" strokeWidth="22" fill="none" />
      </svg>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: '0.02em' }}>
            BLA<span style={{ color: BX.lime }}>XX</span>
          </div>
          <div style={{ fontFamily: BX.mono, fontSize: 8, letterSpacing: '0.42em', color: BX.muted, marginTop: 4 }}>PONTOS</div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: BX.mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: BX.ink, background: BX.lime, padding: '4px 9px', borderRadius: 999,
        }}>
          <Icon name="crown" size={11} color={BX.ink} sw={2.2} />PLANO {tier}
        </span>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: BX.mono, fontSize: 10.5, color: BX.muted, letterSpacing: '0.1em', marginBottom: 3 }}>SALDO DISPONÍVEL</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 34, letterSpacing: '-0.02em', color: BX.fg }}>{fmt(points)}</span>
          <span style={{ fontSize: 14, color: BX.muted, fontWeight: 700 }}>pts</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: BX.fg }}>{name}</span>
          <Mono style={{ fontSize: 12.5, color: BX.muted, letterSpacing: '0.14em' }}>•••• {number}</Mono>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Points evolution chart (SVG area)
// ============================================================
function PointsChart({ data = [12, 18, 15, 24, 21, 30, 27, 36, 33, 42, 39, 48], height = 116, labels }) {
  const W = 360, H = height, pad = 6;
  const max = Math.max(...data) * 1.12, min = 0;
  const xs = data.map((_, i) => pad + (i * (W - pad * 2)) / (data.length - 1));
  const ys = data.map(v => H - pad - ((v - min) / (max - min)) * (H - pad * 2 - 8));
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const area = `${line} L${xs[xs.length - 1].toFixed(1)} ${H} L${xs[0].toFixed(1)} ${H} Z`;
  const lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="pcfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(174,230,58,0.34)" />
          <stop offset="1" stopColor="rgba(174,230,58,0)" />
        </linearGradient>
        <linearGradient id="pcline" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={BX.limeDeep} />
          <stop offset="1" stopColor={BX.limeBright} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(g => (
        <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(244,246,238,0.05)" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#pcfill)" />
      <path d={line} fill="none" stroke="url(#pcline)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="6.5" fill={BX.limeBright} />
      <circle cx={lastX} cy={lastY} r="11" fill="none" stroke="rgba(198,248,51,0.4)" strokeWidth="2" />
    </svg>
  );
}

// ============================================================
// Bottom tab bar (glass dark + central elevated action)
// ============================================================
function TabBar({ active = 'home', onCenter }) {
  const items = [
    { key: 'home', icon: 'home', label: 'Início' },
    { key: 'wallet', icon: 'wallet', label: 'Carteira' },
    { key: 'gift', icon: 'gift', label: 'Resgates' },
    { key: 'user', icon: 'user', label: 'Perfil' },
  ];
  const tab = (it) => {
    const on = active === it.key;
    return (
      <div key={it.key} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        color: on ? BX.lime : BX.subtle,
      }}>
        <Icon name={it.icon} size={23} color={on ? BX.lime : BX.subtle} sw={on ? 2.1 : 1.8} fill={false} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '-0.01em' }}>{it.label}</span>
      </div>
    );
  };
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      paddingBottom: 26, paddingTop: 12,
      background: 'linear-gradient(to top, rgba(8,9,6,0.96) 60%, rgba(8,9,6,0.0))',
    }}>
      <div style={{
        position: 'relative', margin: '0 14px', height: 58, borderRadius: 26,
        background: 'rgba(20,22,14,0.92)', border: `1px solid ${BX.line}`,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', padding: '0 6px',
      }}>
        {tab(items[0])}{tab(items[1])}
        <div style={{ width: 64, flexShrink: 0 }} />
        {tab(items[2])}{tab(items[3])}
        {/* center elevated */}
        <div style={{
          position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
          width: 58, height: 58, borderRadius: '50%',
          background: `linear-gradient(150deg, ${BX.limeBright}, ${BX.limeDeep})`,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 10px 26px rgba(174,230,58,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
          border: '3px solid #0A0B07',
        }}>
          <Icon name="send" size={24} color={BX.ink} sw={2} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Screen frame — scrollable dark canvas inside the device
// ============================================================
function ScreenFrame({ children, tab = 'home', glow = true, bg, padTop = 56, noPadX }) {
  return (
    <div style={{
      height: '100%', position: 'relative', overflow: 'hidden',
      background: bg || BX.bg, fontFamily: BX.display, color: BX.fg,
    }}>
      {glow && <div style={{
        position: 'absolute', top: -90, right: -70, width: 320, height: 320, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(174,230,58,0.16), transparent 64%)',
      }} />}
      <div style={{
        position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        paddingTop: padTop, paddingBottom: tab ? 116 : 40,
      }}>
        <div style={{ padding: noPadX ? 0 : '0 20px', position: 'relative' }}>{children}</div>
      </div>
      {tab && <TabBar active={tab} />}
    </div>
  );
}

Object.assign(window, {
  BX, Icon, Mono, fmt, Chip, Eyebrow, Btn, Card, Avatar, ProgressBar,
  AppHeader, IconBtn, BlaxxCard, PointsChart, TabBar, ScreenFrame,
});
