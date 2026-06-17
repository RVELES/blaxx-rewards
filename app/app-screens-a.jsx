// ============================================================
// BLAXX App · Screens A
// Onboarding · Home · Carteira · Resgates · RewardDetail
// ============================================================

// ---------- 1. ONBOARDING / LOGIN ----------
function ScreenOnboarding() {
  return (
    <div style={{
      height: '100%', position: 'relative', overflow: 'hidden',
      background: `radial-gradient(120% 70% at 50% -8%, rgba(174,230,58,0.20), transparent 50%), ${BX.bg}`,
      fontFamily: BX.display, color: BX.fg,
    }}>
      {/* floating card */}
      <div style={{ position: 'absolute', top: 96, left: 0, right: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 252, transform: 'rotate(-7deg)', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.6))' }}>
          <BlaxxCard points={32480} />
        </div>
        <div style={{
          position: 'absolute', top: -10, right: 36, transform: 'rotate(8deg)',
          background: BX.lime, color: BX.ink, fontFamily: BX.mono, fontWeight: 700,
          fontSize: 11, padding: '6px 11px', borderRadius: 999, boxShadow: BX.limeGlow,
        }}>+500 pts de boas-vindas</div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: '34px 24px 40px',
        background: 'linear-gradient(to top, #0A0B07 70%, transparent)',
      }}>
        <div style={{ fontWeight: 900, fontSize: 21, letterSpacing: '0.02em', marginBottom: 18 }}>
          BLA<span style={{ color: BX.lime }}>XX</span>
          <span style={{ fontFamily: BX.mono, fontSize: 9, letterSpacing: '0.4em', color: BX.muted, marginLeft: 8 }}>PONTOS</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.0, margin: '0 0 12px' }}>
          Seus pontos<br />valem <span style={{ color: BX.lime }}>muito mais.</span>
        </h1>
        <p style={{ fontSize: 15, color: BX.muted, lineHeight: 1.5, margin: '0 0 22px', maxWidth: 300 }}>
          Acumule, compre, envie e troque por recompensas reais. Tudo num só lugar.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 22 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: i === 0 ? 22 : 7, height: 7, borderRadius: 999, background: i === 0 ? BX.lime : 'rgba(244,246,238,0.2)' }} />
          ))}
        </div>

        <Btn kind="primary" block icon="sparkle" style={{ marginBottom: 11 }}>Criar minha conta</Btn>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn kind="ghost" block icon="apple" style={{ flex: 1 }}>Apple</Btn>
          <Btn kind="ghost" block icon="google" style={{ flex: 1 }}>Google</Btn>
        </div>
        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 14, color: BX.muted }}>
          Já tem conta? <span style={{ color: BX.lime, fontWeight: 700 }}>Entrar</span>
        </div>
      </div>
    </div>
  );
}

// ---------- 2. HOME / DASHBOARD ----------
function ScreenHome() {
  const actions = [
    { icon: 'coins', label: 'Comprar' },
    { icon: 'send', label: 'Enviar' },
    { icon: 'gift', label: 'Resgatar' },
    { icon: 'qr', label: 'Pagar' },
  ];
  const missions = [
    { icon: 'coins', t: 'Compre 5.000 pts', s: 'Bônus de boas-vindas', r: '+250', p: 100, done: true },
    { icon: 'send', t: 'Envie pontos a um amigo', s: 'Primeira transferência', r: '+150', p: 0 },
    { icon: 'target', t: 'Resgate uma recompensa', s: 'Qualquer categoria', r: '+300', p: 0 },
  ];
  return (
    <ScreenFrame tab="home">
      <AppHeader
        leadAvatar="R" sub="BOM TE VER DE VOLTA" title="Olá, Ricardo"
        action={<IconBtn name="bell" badge />}
      />
      <BlaxxCard points={32480} />

      {/* quick actions */}
      <div style={{ display: 'flex', gap: 8, margin: '18px 0 22px' }}>
        {actions.map(a => (
          <div key={a.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center',
              background: 'rgba(174,230,58,0.10)', border: '1px solid rgba(174,230,58,0.24)',
            }}>
              <Icon name={a.icon} size={23} color={BX.lime} sw={1.9} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: BX.muted }}>{a.label}</span>
          </div>
        ))}
      </div>

      {/* level progress */}
      <Card pad={18} style={{ marginBottom: 16, background: `linear-gradient(150deg, rgba(174,230,58,0.10), ${BX.surf} 60%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: BX.mono, fontSize: 10.5, color: BX.muted, letterSpacing: '0.08em' }}>NÍVEL 02 · PLANO PLUS</div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 3 }}>Rumo ao Plano Prime</div>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(174,230,58,0.14)', display: 'grid', placeItems: 'center', border: '1px solid rgba(174,230,58,0.3)' }}>
            <Icon name="crown" size={22} color={BX.lime} sw={1.8} />
          </div>
        </div>
        <ProgressBar value={67} glow />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 12.5 }}>
          <span style={{ color: BX.muted }}>Faltam <b style={{ color: BX.fg }}>12.520 pts</b></span>
          <span style={{ color: BX.lime, fontWeight: 700 }}>+20% de bônus</span>
        </div>
      </Card>

      {/* daily missions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 2px 12px' }}>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em' }}>Missões do dia</div>
        <span style={{ fontFamily: BX.mono, fontSize: 11, color: BX.lime, fontWeight: 700 }}>1/3</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {missions.map((m, i) => (
          <Card key={i} pad={13} style={{ display: 'flex', alignItems: 'center', gap: 13, opacity: m.done ? 0.62 : 1 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: m.done ? BX.lime : 'rgba(244,246,238,0.06)',
            }}>
              <Icon name={m.done ? 'check' : m.icon} size={20} color={m.done ? BX.ink : BX.lime} sw={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, textDecoration: m.done ? 'line-through' : 'none' }}>{m.t}</div>
              <div style={{ fontSize: 12, color: BX.muted, marginTop: 1 }}>{m.s}</div>
            </div>
            <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 14, color: BX.lime, flexShrink: 0 }}>{m.r}</span>
          </Card>
        ))}
      </div>

      {/* streak */}
      <Card pad={15} style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(240,184,62,0.14)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon name="fire" size={24} color={BX.warn} fill sw={0} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>Sequência de 6 dias 🔥</div>
          <div style={{ fontSize: 12, color: BX.muted, marginTop: 1 }}>Volte amanhã para ganhar +50 pts</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 1, 1, 1, 1, 1, 0].map((d, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: d ? BX.warn : 'rgba(244,246,238,0.12)' }} />
          ))}
        </div>
      </Card>
    </ScreenFrame>
  );
}

// ---------- 3. CARTEIRA + chart ----------
function ScreenCarteira() {
  const tx = [
    { icon: 'coins', t: 'Compra de pontos', s: 'Hoje · 14:32', v: '+5.000', pos: true },
    { icon: 'gift', t: 'Resgate iFood', s: 'Ontem · 19:05', v: '−2.500', pos: false },
    { icon: 'send', t: 'Recebido de Marina', s: '12 mai · 10:20', v: '+1.200', pos: true },
    { icon: 'target', t: 'Missão concluída', s: '11 mai · 09:00', v: '+250', pos: true },
    { icon: 'send', t: 'Enviado a João', s: '09 mai · 16:44', v: '−800', pos: false },
  ];
  return (
    <ScreenFrame tab="wallet">
      <AppHeader sub="MINHA CARTEIRA" title="Carteira" action={<IconBtn name="gear" />} />

      {/* balance + chart */}
      <Card pad={18} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: BX.mono, fontSize: 10.5, color: BX.muted, letterSpacing: '0.08em' }}>SALDO TOTAL</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 4 }}>
              <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 33, letterSpacing: '-0.02em' }}>32.480</span>
              <span style={{ fontSize: 14, color: BX.muted, fontWeight: 700 }}>pts</span>
            </div>
            <div style={{ fontSize: 13, color: BX.muted, marginTop: 2 }}>≈ <b style={{ color: BX.fg }}>R$ 324,80</b> em resgates</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: BX.mono, fontSize: 12, fontWeight: 700, color: BX.pos, background: 'rgba(155,226,90,0.12)', padding: '5px 9px', borderRadius: 999 }}>
            <Icon name="arrowUp" size={13} color={BX.pos} sw={2.4} />+18%
          </span>
        </div>
        <div style={{ marginTop: 14 }}><PointsChart /></div>
        <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          {['7D', '30D', '6M', '1A'].map((p, i) => (
            <span key={p} style={{ flex: 1, textAlign: 'center', fontFamily: BX.mono, fontSize: 12, fontWeight: 700, padding: '7px 0', borderRadius: 10, background: i === 1 ? BX.lime : 'rgba(244,246,238,0.05)', color: i === 1 ? BX.ink : BX.muted }}>{p}</span>
          ))}
        </div>
      </Card>

      {/* breakdown */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[
          { l: 'Disponível', v: '29.980', c: BX.fg },
          { l: 'A expirar', v: '2.500', c: BX.warn, note: '54 dias' },
        ].map(b => (
          <Card key={b.l} pad={14} style={{ flex: 1 }}>
            <div style={{ fontFamily: BX.mono, fontSize: 10, color: BX.muted, letterSpacing: '0.06em' }}>{b.l.toUpperCase()}</div>
            <div style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 20, color: b.c, marginTop: 5 }}>{b.v}</div>
            {b.note && <div style={{ fontSize: 11, color: BX.warn, marginTop: 3 }}>⚠ expira em {b.note}</div>}
          </Card>
        ))}
      </div>

      {/* extrato */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 12px' }}>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em' }}>Extrato</div>
        <span style={{ fontSize: 13, color: BX.lime, fontWeight: 700 }}>Ver tudo</span>
      </div>
      <Card pad={6}>
        {tx.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 10px', borderBottom: i < tx.length - 1 ? `1px solid ${BX.line}` : 'none' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: t.pos ? 'rgba(155,226,90,0.12)' : 'rgba(255,114,86,0.12)' }}>
              <Icon name={t.icon} size={19} color={t.pos ? BX.pos : BX.neg} sw={1.9} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.t}</div>
              <div style={{ fontSize: 11.5, color: BX.muted, marginTop: 1 }}>{t.s}</div>
            </div>
            <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 14, color: t.pos ? BX.pos : BX.fg }}>{t.v}</span>
          </div>
        ))}
      </Card>
    </ScreenFrame>
  );
}

// ---------- 4. RESGATES (catálogo) ----------
function ScreenResgates() {
  const cats = ['Todos', 'Vouchers', 'Cashback', 'Milhas', 'Streaming'];
  const rewards = [
    { brand: 'iF', name: 'iFood', sub: 'R$ 25 em pedidos', pts: '2.500', color: '#EA1D2C', can: true },
    { brand: 'Sp', name: 'Spotify', sub: '1 mês Premium', pts: '3.200', color: '#1DB954', can: true },
    { brand: 'Up', name: 'Uber', sub: 'R$ 20 em viagens', pts: '2.000', color: '#000', can: true },
    { brand: 'Am', name: 'Amazon', sub: 'Vale R$ 50', pts: '5.000', color: '#FF9900', can: true },
    { brand: 'Nu', name: 'Netflix', sub: 'Plano padrão', pts: '4.800', color: '#E50914', can: false },
    { brand: 'St', name: 'Starbucks', sub: 'Bebida grátis', pts: '1.800', color: '#00704A', can: true },
  ];
  return (
    <ScreenFrame tab="gift">
      <AppHeader sub="LOJA DE RECOMPENSAS" title="Resgates" action={<IconBtn name="search" />} />

      {/* balance pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: BX.surf, border: `1px solid ${BX.line}`, borderRadius: 14, padding: '11px 15px', marginBottom: 16 }}>
        <Icon name="coins" size={18} color={BX.lime} sw={1.9} />
        <span style={{ fontSize: 13.5, color: BX.muted }}>Seu saldo</span>
        <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 16, color: BX.lime, marginLeft: 'auto' }}>32.480 pts</span>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px 16px', padding: '0 20px' }}>
        {cats.map((c, i) => <Chip key={c} active={i === 0}>{c}</Chip>)}
      </div>

      {/* featured */}
      <div style={{
        position: 'relative', borderRadius: 20, padding: 18, marginBottom: 18, overflow: 'hidden',
        background: `radial-gradient(120% 120% at 100% 0%, rgba(174,230,58,0.28), transparent 55%), ${BX.surf2}`,
        border: '1px solid rgba(174,230,58,0.22)',
      }}>
        <Eyebrow icon="bolt">Destaque da semana</Eyebrow>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', margin: '11px 0 4px' }}>Dobro de pontos no iFood</div>
        <div style={{ fontSize: 13, color: BX.muted, marginBottom: 14 }}>Resgate vouchers com 50% menos pontos até domingo.</div>
        <Btn kind="primary" sm icon="gift">Aproveitar agora</Btn>
      </div>

      {/* grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {rewards.map((r, i) => (
          <Card key={i} pad={13} style={{ opacity: r.can ? 1 : 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: r.color, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 15 }}>{r.brand}</div>
              {!r.can && <Icon name="lock" size={16} color={BX.subtle} sw={1.8} />}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>{r.name}</div>
            <div style={{ fontSize: 11.5, color: BX.muted, marginTop: 1, marginBottom: 12 }}>{r.sub}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 13.5, color: r.can ? BX.lime : BX.muted }}>{r.pts}</span>
              <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 10, background: r.can ? BX.lime : 'rgba(244,246,238,0.06)' }}>
                <Icon name={r.can ? 'plus' : 'lock'} size={15} color={r.can ? BX.ink : BX.subtle} sw={2.2} />
              </span>
            </div>
          </Card>
        ))}
      </div>
    </ScreenFrame>
  );
}

// ---------- 5. REWARD DETAIL + CHECKOUT (with reward animation) ----------
function ScreenRewardDetail() {
  // confetti pieces
  const pieces = Array.from({ length: 22 }, (_, i) => i);
  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: BX.bg, fontFamily: BX.display, color: BX.fg }}>
      <style>{`
        @keyframes bxBurst {
          0% { transform: translate(0,0) scale(0); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0; }
        }
        @keyframes bxPop {
          0% { transform: scale(0.5); opacity: 0; }
          55% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bxRing {
          0% { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      `}</style>

      {/* hero */}
      <div style={{
        position: 'relative', height: 300, display: 'grid', placeItems: 'center',
        background: `radial-gradient(80% 90% at 50% 30%, rgba(234,29,44,0.32), transparent 60%), ${BX.bg2}`,
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 58, left: 20 }}>
          <IconBtn name="chevL" />
        </div>
        {/* confetti */}
        {pieces.map(i => {
          const ang = (i / pieces.length) * Math.PI * 2;
          const dist = 90 + (i % 4) * 26;
          const colors = [BX.lime, BX.limeBright, '#fff', BX.warn];
          return (
            <span key={i} style={{
              position: 'absolute', top: 130, left: '50%', width: i % 3 ? 8 : 11, height: i % 3 ? 8 : 5,
              borderRadius: i % 2 ? '50%' : 2, background: colors[i % 4],
              '--tx': `${Math.cos(ang) * dist}px`, '--ty': `${Math.sin(ang) * dist - 10}px`,
              animation: `bxBurst ${1.4 + (i % 5) * 0.12}s ${0.1 + (i % 6) * 0.05}s ease-out infinite`,
            }} />
          );
        })}
        <span style={{ position: 'absolute', top: 86, width: 128, height: 128, borderRadius: '50%', border: `2px solid ${BX.lime}`, animation: 'bxRing 1.8s ease-out infinite' }} />
        <div style={{
          width: 110, height: 110, borderRadius: 30, background: '#EA1D2C', display: 'grid', placeItems: 'center',
          color: '#fff', fontWeight: 800, fontSize: 38, boxShadow: '0 20px 50px rgba(234,29,44,0.5)',
          animation: 'bxPop 0.7s cubic-bezier(0.16,1,0.3,1) both',
        }}>iF</div>
      </div>

      {/* sheet */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 272, background: BX.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${BX.line}`, borderBottom: 'none', padding: '24px 22px 30px', overflowY: 'auto' }}>
        <Eyebrow icon="ticket">Voucher · iFood</Eyebrow>
        <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em', margin: '12px 0 6px' }}>R$ 25 em pedidos</h2>
        <p style={{ fontSize: 14, color: BX.muted, lineHeight: 1.5, margin: '0 0 20px' }}>
          Vale-presente válido em qualquer restaurante do app. Código enviado na hora, validade de 12 meses.
        </p>

        <Card pad={16} style={{ marginBottom: 14 }}>
          {[
            { l: 'Custo do resgate', v: '2.500 pts', c: BX.fg },
            { l: 'Seu saldo após', v: '29.980 pts', c: BX.muted },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i === 0 ? `1px solid ${BX.line}` : 'none' }}>
              <span style={{ fontSize: 14, color: BX.muted }}>{r.l}</span>
              <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 14.5, color: r.c }}>{r.v}</span>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, color: BX.pos, fontSize: 13 }}>
          <Icon name="shield" size={16} color={BX.pos} sw={1.8} />
          <span>Resgate protegido · estorno garantido em até 7 dias</span>
        </div>

        <Btn kind="primary" block icon="gift">Confirmar resgate · 2.500 pts</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenOnboarding, ScreenHome, ScreenCarteira, ScreenResgates, ScreenRewardDetail });
