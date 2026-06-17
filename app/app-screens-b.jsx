// ============================================================
// BLAXX App · Screens B
// Comprar · Enviar · Campanhas · Indique · Notificações
// ============================================================

// ---------- 6. COMPRAR PONTOS (hero) ----------
function ScreenComprar() {
  const packs = [
    { pts: '2.500', price: 'R$ 25', bonus: null },
    { pts: '5.500', price: 'R$ 50', bonus: '+10%', hot: true },
    { pts: '12.000', price: 'R$ 100', bonus: '+20%' },
    { pts: '30.000', price: 'R$ 240', bonus: '+25%' },
  ];
  return (
    <ScreenFrame tab="home">
      <AppHeader sub="ABASTECER CARTEIRA" title="Comprar pontos" action={<IconBtn name="close" />} />

      <p style={{ fontSize: 14, color: BX.muted, lineHeight: 1.5, margin: '-4px 0 18px' }}>
        Quanto mais você compra, <b style={{ color: BX.lime }}>mais bônus</b> recebe. Use para resgatar ou enviar a amigos.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 20 }}>
        {packs.map((p, i) => (
          <div key={i} style={{
            position: 'relative', borderRadius: 18, padding: 16,
            background: p.hot ? `radial-gradient(130% 120% at 100% 0%, rgba(174,230,58,0.22), transparent 58%), ${BX.surf2}` : BX.surf,
            border: p.hot ? '1px solid rgba(174,230,58,0.4)' : `1px solid ${BX.line}`,
          }}>
            {p.hot && <span style={{ position: 'absolute', top: -9, right: 14, background: BX.lime, color: BX.ink, fontFamily: BX.mono, fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>MAIS POPULAR</span>}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 23, letterSpacing: '-0.02em' }}>{p.pts}</span>
              <span style={{ fontSize: 12, color: BX.muted, fontWeight: 700 }}>pts</span>
            </div>
            {p.bonus && <span style={{ display: 'inline-block', marginTop: 8, fontFamily: BX.mono, fontSize: 11, fontWeight: 700, color: BX.lime, background: 'rgba(174,230,58,0.12)', padding: '3px 9px', borderRadius: 999 }}>{p.bonus} bônus</span>}
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: p.bonus ? 11 : 14 }}>{p.price}</div>
          </div>
        ))}
      </div>

      {/* custom slider */}
      <Card pad={18} style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Valor personalizado</span>
          <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 16, color: BX.lime }}>8.000 pts</span>
        </div>
        <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'rgba(244,246,238,0.1)' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '52%', borderRadius: 999, background: `linear-gradient(90deg, ${BX.limeDeep}, ${BX.limeBright})` }} />
          <div style={{ position: 'absolute', left: '52%', top: '50%', transform: 'translate(-50%,-50%)', width: 24, height: 24, borderRadius: '50%', background: BX.lime, border: '3px solid #0A0B07', boxShadow: '0 0 12px rgba(174,230,58,0.6)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: BX.mono, fontSize: 11, color: BX.muted }}>
          <span>1.000</span><span>50.000</span>
        </div>
      </Card>

      {/* payment */}
      <div style={{ fontSize: 13, fontWeight: 800, color: BX.muted, margin: '0 2px 10px', fontFamily: BX.mono, letterSpacing: '0.06em' }}>FORMA DE PAGAMENTO</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[{ i: 'bolt', l: 'Pix', on: true }, { i: 'card', l: 'Cartão', on: false }].map(m => (
          <div key={m.l} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, padding: '13px 14px', borderRadius: 14, background: m.on ? 'rgba(174,230,58,0.10)' : BX.surf, border: `1px solid ${m.on ? 'rgba(174,230,58,0.4)' : BX.line}` }}>
            <Icon name={m.i} size={19} color={m.on ? BX.lime : BX.muted} sw={1.9} />
            <span style={{ fontSize: 14, fontWeight: 800, color: m.on ? BX.fg : BX.muted }}>{m.l}</span>
            {m.on && <Icon name="check" size={16} color={BX.lime} sw={2.4} style={{ marginLeft: 'auto' }} />}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 2px' }}>
        <span style={{ fontSize: 13, color: BX.muted }}>Total a pagar</span>
        <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 19 }}>R$ 72,00</span>
      </div>
      <Btn kind="primary" block icon="bolt">Pagar com Pix</Btn>
    </ScreenFrame>
  );
}

// ---------- 7. ENVIAR PONTOS (hero) ----------
function ScreenEnviar() {
  const contacts = [
    { n: 'Marina', i: 'M', lime: true }, { n: 'João', i: 'J' }, { n: 'Lucas', i: 'L' }, { n: 'Bia', i: 'B' }, { n: 'Theo', i: 'T' },
  ];
  return (
    <ScreenFrame tab="home" glow>
      <AppHeader sub="TRANSFERIR PONTOS" title="Enviar" action={<IconBtn name="qr" />} />

      {/* recipient */}
      <div style={{ fontSize: 13, fontWeight: 800, color: BX.muted, margin: '0 2px 12px', fontFamily: BX.mono, letterSpacing: '0.06em' }}>PARA QUEM?</div>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', margin: '0 -20px 22px', padding: '0 20px 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', border: `1.5px dashed ${BX.line2}`, display: 'grid', placeItems: 'center' }}>
            <Icon name="plus" size={20} color={BX.muted} sw={2} />
          </div>
          <span style={{ fontSize: 11, color: BX.muted, fontWeight: 700 }}>Novo</span>
        </div>
        {contacts.map(c => (
          <div key={c.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Avatar initial={c.i} size={52} lime={c.lime} />
              {c.lime && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 18, height: 18, borderRadius: '50%', background: BX.lime, border: `2.5px solid ${BX.bg}`, display: 'grid', placeItems: 'center' }}><Icon name="check" size={10} color={BX.ink} sw={3} /></span>}
            </div>
            <span style={{ fontSize: 11, color: c.lime ? BX.fg : BX.muted, fontWeight: 700 }}>{c.n}</span>
          </div>
        ))}
      </div>

      {/* amount */}
      <Card pad={22} style={{ textAlign: 'center', marginBottom: 14, background: `radial-gradient(120% 100% at 50% 0%, rgba(174,230,58,0.10), ${BX.surf} 60%)` }}>
        <div style={{ fontFamily: BX.mono, fontSize: 11, color: BX.muted, letterSpacing: '0.08em', marginBottom: 10 }}>VOCÊ ENVIA PARA MARINA</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 50, letterSpacing: '-0.03em', color: BX.lime }}>1.200</span>
          <span style={{ fontSize: 17, color: BX.muted, fontWeight: 700 }}>pts</span>
        </div>
        <div style={{ fontSize: 13, color: BX.muted, marginTop: 6 }}>≈ R$ 12,00 · sem taxas</div>
      </Card>

      {/* quick chips */}
      <div style={{ display: 'flex', gap: 9, marginBottom: 20 }}>
        {['+100', '+500', '+1.000', 'Tudo'].map((q, i) => (
          <span key={q} style={{ flex: 1, textAlign: 'center', fontFamily: BX.mono, fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: 12, background: i === 2 ? 'rgba(174,230,58,0.12)' : 'rgba(244,246,238,0.05)', color: i === 2 ? BX.lime : BX.muted, border: `1px solid ${i === 2 ? 'rgba(174,230,58,0.34)' : BX.line}` }}>{q}</span>
        ))}
      </div>

      {/* message */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderRadius: 14, background: BX.surf, border: `1px solid ${BX.line}`, marginBottom: 16 }}>
        <Icon name="heart" size={18} color={BX.muted} sw={1.9} />
        <span style={{ fontSize: 14, color: BX.fg }}>Parabéns pelo aniversário! 🎉</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: BX.muted, fontSize: 12.5, padding: '0 2px' }}>
        <Icon name="bolt" size={15} color={BX.lime} sw={2} />
        <span>Transferência instantânea · saldo após envio: <b style={{ color: BX.fg }}>31.280 pts</b></span>
      </div>
      <Btn kind="primary" block icon="send">Enviar 1.200 pts</Btn>
    </ScreenFrame>
  );
}

// ---------- 8. CAMPANHAS / MISSÕES ----------
function ScreenCampanhas() {
  const missions = [
    { icon: 'coins', t: 'Compre 10.000 pts', s: 'Progresso 6.000 / 10.000', r: '+500', p: 60 },
    { icon: 'send', t: 'Envie a 3 amigos', s: 'Progresso 1 / 3', r: '+300', p: 33 },
    { icon: 'gift', t: 'Faça 5 resgates', s: 'Progresso 2 / 5', r: '+400', p: 40 },
    { icon: 'star', t: 'Avalie 3 parceiros', s: 'Progresso 0 / 3', r: '+120', p: 0 },
  ];
  const badges = [
    { i: 'fire', on: true }, { i: 'crown', on: true }, { i: 'bolt', on: true }, { i: 'star', on: false }, { i: 'shield', on: false },
  ];
  return (
    <ScreenFrame tab="home">
      <AppHeader sub="DESAFIOS E RECOMPENSAS" title="Campanhas" action={<IconBtn name="clock" />} />

      {/* featured campaign */}
      <div style={{ position: 'relative', borderRadius: 22, padding: 20, marginBottom: 20, overflow: 'hidden', background: `radial-gradient(110% 120% at 90% 0%, rgba(174,230,58,0.30), transparent 55%), linear-gradient(160deg, #1A1D12, #0B0C08)`, border: '1px solid rgba(174,230,58,0.24)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Eyebrow icon="fire">Temporada · maio</Eyebrow>
          <span style={{ fontFamily: BX.mono, fontSize: 12, fontWeight: 700, color: BX.warn }}>⏱ 12d restantes</span>
        </div>
        <div style={{ fontSize: 23, fontWeight: 900, letterSpacing: '-0.025em', marginBottom: 6 }}>Maratona de Pontos</div>
        <div style={{ fontSize: 13.5, color: BX.muted, marginBottom: 16 }}>Complete missões e suba no ranking para ganhar até <b style={{ color: BX.lime }}>10.000 pts</b>.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}><ProgressBar value={48} glow /></div>
          <span style={{ fontFamily: BX.mono, fontSize: 13, fontWeight: 700, color: BX.lime }}>2.400 XP</span>
        </div>
      </div>

      {/* badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 12px' }}>
        <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em' }}>Conquistas</div>
        <span style={{ fontFamily: BX.mono, fontSize: 12, color: BX.muted }}>3/5</span>
      </div>
      <div style={{ display: 'flex', gap: 11, marginBottom: 22 }}>
        {badges.map((b, i) => (
          <div key={i} style={{ flex: 1, aspectRatio: '1', borderRadius: 16, display: 'grid', placeItems: 'center', background: b.on ? 'rgba(174,230,58,0.12)' : 'rgba(244,246,238,0.04)', border: `1px solid ${b.on ? 'rgba(174,230,58,0.3)' : BX.line}` }}>
            <Icon name={b.on ? b.i : 'lock'} size={22} color={b.on ? BX.lime : BX.subtle} sw={1.8} fill={b.on && b.i === 'fire'} />
          </div>
        ))}
      </div>

      {/* missions list */}
      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 2px 12px' }}>Missões ativas</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {missions.map((m, i) => (
          <Card key={i} pad={15}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(174,230,58,0.10)' }}>
                <Icon name={m.icon} size={20} color={BX.lime} sw={1.9} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>{m.t}</div>
                <div style={{ fontSize: 12, color: BX.muted, marginTop: 1 }}>{m.s}</div>
              </div>
              <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 14, color: BX.lime }}>{m.r}</span>
            </div>
            <ProgressBar value={m.p} h={7} />
          </Card>
        ))}
      </div>
    </ScreenFrame>
  );
}

// ---------- 9. INDIQUE E GANHE ----------
function ScreenIndique() {
  const friends = [
    { n: 'Marina Costa', s: 'Ganhou você +1.000', i: 'M', done: true },
    { n: 'João Pedro', s: 'Cadastro pendente', i: 'J', done: false },
    { n: 'Lucas Reis', s: 'Ganhou você +1.000', i: 'L', done: true },
  ];
  return (
    <ScreenFrame tab="user">
      <AppHeader sub="PROGRAMA DE INDICAÇÃO" title="Indique e ganhe" action={<IconBtn name="share" />} />

      {/* hero reward */}
      <div style={{ position: 'relative', borderRadius: 22, padding: '26px 20px', marginBottom: 18, overflow: 'hidden', textAlign: 'center', background: `radial-gradient(100% 90% at 50% 0%, rgba(174,230,58,0.26), transparent 60%), ${BX.surf2}`, border: '1px solid rgba(174,230,58,0.22)' }}>
        <div style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px', display: 'grid', placeItems: 'center', background: BX.lime, boxShadow: BX.limeGlow }}>
          <Icon name="heart" size={28} color={BX.ink} sw={1.9} />
        </div>
        <div style={{ fontSize: 14, color: BX.muted, marginBottom: 4 }}>Você ganha por cada amigo</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 7 }}>
          <span style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 46, color: BX.lime, letterSpacing: '-0.03em' }}>1.000</span>
          <span style={{ fontSize: 16, color: BX.muted, fontWeight: 700 }}>pts</span>
        </div>
        <div style={{ fontSize: 13, color: BX.muted, marginTop: 4 }}>e seu amigo ganha <b style={{ color: BX.fg }}>500 pts</b> de bônus</div>
      </div>

      {/* referral code */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 14, background: BX.surf, border: `1px dashed ${BX.line2}`, marginBottom: 11 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: BX.mono, fontSize: 10, color: BX.muted, letterSpacing: '0.08em', marginBottom: 3 }}>SEU CÓDIGO</div>
          <div style={{ fontFamily: BX.mono, fontWeight: 700, fontSize: 18, color: BX.lime, letterSpacing: '0.1em' }}>RICARDO500</div>
        </div>
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(174,230,58,0.12)' }}>
          <Icon name="copy" size={18} color={BX.lime} sw={1.9} />
        </span>
      </div>
      <Btn kind="primary" block icon="share" style={{ marginBottom: 24 }}>Compartilhar convite</Btn>

      {/* progress milestone */}
      <Card pad={16} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Meta: 5 amigos</span>
          <span style={{ fontFamily: BX.mono, fontSize: 13, fontWeight: 700, color: BX.lime }}>2/5 · +2.500 extra</span>
        </div>
        <ProgressBar value={40} glow />
      </Card>

      {/* friends */}
      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 2px 12px' }}>Seus convites</div>
      <Card pad={6}>
        {friends.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 10px', borderBottom: i < friends.length - 1 ? `1px solid ${BX.line}` : 'none' }}>
            <Avatar initial={f.i} size={38} lime={f.done} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{f.n}</div>
              <div style={{ fontSize: 12, color: f.done ? BX.pos : BX.warn, marginTop: 1 }}>{f.s}</div>
            </div>
            <Icon name={f.done ? 'check' : 'clock'} size={18} color={f.done ? BX.pos : BX.warn} sw={2} />
          </div>
        ))}
      </Card>
    </ScreenFrame>
  );
}

// ---------- 10. NOTIFICAÇÕES ----------
function ScreenNotificacoes() {
  const groups = [
    {
      day: 'HOJE', items: [
        { icon: 'coins', c: BX.lime, t: 'Compra confirmada', s: '5.000 pts adicionados à carteira', time: '14:32', unread: true },
        { icon: 'send', c: BX.info, t: 'Marina te enviou pontos', s: '+1.200 pts · "Parabéns! 🎉"', time: '10:20', unread: true },
        { icon: 'fire', c: BX.warn, t: 'Sequência em risco!', s: 'Acesse hoje para manter seus 6 dias', time: '08:00', unread: false },
      ]
    },
    {
      day: 'ESTA SEMANA', items: [
        { icon: 'gift', c: BX.lime, t: 'Resgate concluído', s: 'Voucher iFood enviado por e-mail', time: 'Ontem', unread: false },
        { icon: 'target', c: BX.lime, t: 'Missão concluída', s: 'Você ganhou +250 pts de bônus', time: '2d', unread: false },
        { icon: 'clock', c: BX.warn, t: 'Pontos a expirar', s: '2.500 pts expiram em 54 dias', time: '3d', unread: false },
      ]
    },
  ];
  return (
    <ScreenFrame tab="home">
      <AppHeader sub="CENTRAL DE AVISOS" title="Notificações" action={<IconBtn name="gear" />} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['Todas', 'Pontos', 'Resgates', 'Campanhas'].map((c, i) => <Chip key={c} active={i === 0}>{c}</Chip>)}
      </div>

      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: BX.mono, fontSize: 10.5, color: BX.subtle, letterSpacing: '0.1em', margin: '0 2px 10px' }}>{g.day}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.items.map((n, i) => (
              <Card key={i} pad={14} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', background: n.unread ? 'rgba(174,230,58,0.05)' : BX.surf, border: `1px solid ${n.unread ? 'rgba(174,230,58,0.18)' : BX.line}` }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'rgba(244,246,238,0.05)' }}>
                  <Icon name={n.icon} size={19} color={n.c} sw={1.9} fill={n.icon === 'fire'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800 }}>{n.t}</span>
                    {n.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: BX.lime, flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: 12.5, color: BX.muted, marginTop: 2, lineHeight: 1.4 }}>{n.s}</div>
                </div>
                <span style={{ fontFamily: BX.mono, fontSize: 11, color: BX.subtle, flexShrink: 0 }}>{n.time}</span>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </ScreenFrame>
  );
}

Object.assign(window, { ScreenComprar, ScreenEnviar, ScreenCampanhas, ScreenIndique, ScreenNotificacoes });
