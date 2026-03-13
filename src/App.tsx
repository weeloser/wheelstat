import React, {
  createContext, useContext, useReducer, useCallback,
  useRef, useEffect, useState, useMemo,
} from 'react';

// ─── Types ───────────────────────────────────────────────
interface IncItem { id: string; date: string; service: string; price: number; qty: number; total: number }
interface ExpItem { id: string; date: string; desc: string; price: number; qty: number; total: number }
interface CliItem { id: string; date: string; name: string; phone: string; plate: string; visits: number }
interface WhItem  { id: string; name: string; price: number; qty: number }
interface DebtItem { id: string; date: string; name: string; phone: string; amount: number; paid: boolean }
interface Tpl { name: string; price: number; qty: number; types: string[] }
interface Settings {
  theme: 'dark' | 'light'; currency: string; confirm: boolean; color: string;
  scale: string; anim: boolean; compact: boolean; currencyPos: 'left' | 'right';
  design: 'default' | 'glass' | 'soft'; taxRate: number; lowStock: number;
  round: boolean; decimals: boolean; dateFormat: 'ru' | 'iso';
}
interface Data {
  income: IncItem[]; expenses: ExpItem[]; clients: CliItem[];
  warehouse: WhItem[]; debts: DebtItem[]; templates: Tpl[]; settings: Settings;
}
type Tab = 'total' | 'income' | 'expenses' | 'clients' | 'warehouse' | 'debts' | 'settings';

// ─── Helpers ─────────────────────────────────────────────
const uid = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sf = (v: unknown): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; };
const td = () => new Date().toISOString().slice(0, 10);

const DS: Settings = {
  theme: 'dark', currency: '₽', confirm: true, color: '#3b82f6', scale: '1',
  anim: true, compact: false, currencyPos: 'right', design: 'default',
  taxRate: 6, lowStock: 5, round: false, decimals: true, dateFormat: 'ru',
};
const DD: Data = { income: [], expenses: [], clients: [], warehouse: [], debts: [], templates: [], settings: { ...DS } };

function load(): Data {
  try {
    const r = localStorage.getItem('tireData');
    if (!r) return { ...DD, settings: { ...DS } };
    const p = JSON.parse(r);
    return {
      income: p.income || [], expenses: p.expenses || [], clients: p.clients || [],
      warehouse: p.warehouse || [], debts: p.debts || [],
      templates: (p.templates || []).map((t: Tpl) => ({ ...t, types: t.types || ['income'] })),
      settings: { ...DS, ...(p.settings || {}) },
    };
  } catch { return { ...DD, settings: { ...DS } }; }
}

// ─── Reducer ─────────────────────────────────────────────
type Act =
  | { type: 'SET'; d: Data }
  | { type: 'ADD'; col: 'income' | 'expenses' | 'clients' | 'warehouse' | 'debts' }
  | { type: 'UPD'; col: keyof Data; id: string; k: string; v: string | number | boolean }
  | { type: 'CALC'; col: keyof Data; id: string; k: string; v: number }
  | { type: 'DEL'; col: keyof Data; id: string }
  | { type: 'TOGGLE_DEBT'; id: string }
  | { type: 'SORT'; col: keyof Data; k: string; dir: number }
  | { type: 'SETTINGS'; p: Partial<Settings> }
  | { type: 'ADD_TPL'; t: Tpl }
  | { type: 'DEL_TPL'; i: number }
  | { type: 'MERGE_CLI'; keep: string; rm: string }
  | { type: 'CLEAR' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ga = (s: Data, col: keyof Data) => (s as any)[col] as any[];

function reducer(s: Data, a: Act): Data {
  switch (a.type) {
    case 'SET': return a.d;
    case 'ADD': {
      const d = td();
      const map: Record<string, Record<string, unknown>> = {
        income: { id: uid(), date: d, service: '', price: 0, qty: 1, total: 0 },
        expenses: { id: uid(), date: d, desc: '', price: 0, qty: 1, total: 0 },
        clients: { id: uid(), date: d, name: '', phone: '', plate: '', visits: 1 },
        warehouse: { id: uid(), name: '', qty: 0, price: 0 },
        debts: { id: uid(), date: d, name: '', phone: '', amount: 0, paid: false },
      };
      const n = map[a.col];
      if (!n) return s;
      return { ...s, [a.col]: [n, ...ga(s, a.col)] };
    }
    case 'UPD': {
      const arr = [...ga(s, a.col)];
      const i = arr.findIndex((x: { id: string }) => x.id === a.id);
      if (i < 0) return s;
      arr[i] = { ...arr[i], [a.k]: a.v };
      return { ...s, [a.col]: arr };
    }
    case 'CALC': {
      const arr = [...ga(s, a.col)];
      const i = arr.findIndex((x: { id: string }) => x.id === a.id);
      if (i < 0) return s;
      const item = { ...arr[i], [a.k]: a.v };
      item.total = Math.round(sf(item.price) * sf(item.qty) * 100) / 100;
      arr[i] = item;
      return { ...s, [a.col]: arr };
    }
    case 'DEL': return { ...s, [a.col]: ga(s, a.col).filter((x: { id: string }) => x.id !== a.id) };
    case 'TOGGLE_DEBT': return { ...s, debts: s.debts.map(d => d.id === a.id ? { ...d, paid: !d.paid } : d) };
    case 'SORT': {
      const arr = [...ga(s, a.col)];
      arr.sort((x: Record<string, unknown>, y: Record<string, unknown>) => {
        const va = String(x[a.k] ?? ''), vb = String(y[a.k] ?? '');
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * a.dir;
        return va.localeCompare(vb) * a.dir;
      });
      return { ...s, [a.col]: arr };
    }
    case 'SETTINGS': return { ...s, settings: { ...s.settings, ...a.p } };
    case 'ADD_TPL': return { ...s, templates: [...s.templates, a.t] };
    case 'DEL_TPL': return { ...s, templates: s.templates.filter((_, i) => i !== a.i) };
    case 'MERGE_CLI': {
      const keep = s.clients.find(c => c.id === a.keep);
      if (!keep) return s;
      return {
        ...s,
        clients: s.clients
          .filter(c => c.id !== a.rm)
          .map(c => c.id === a.keep ? { ...c, visits: (c.visits || 1) + 1, date: td() } : c),
      };
    }
    case 'CLEAR': { localStorage.removeItem('tireData'); return { ...DD, settings: { ...DS } }; }
    default: return s;
  }
}

// ─── Context ─────────────────────────────────────────────
interface Ctx {
  data: Data; dispatch: React.Dispatch<Act>;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  fmt: (v: number | string) => string; toast: (m: string) => void;
  toasts: { id: number; msg: string; out: boolean }[];
}
const C = createContext<Ctx>(null!);
const useS = () => useContext(C);

function Provider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, null, load);
  const hist = useRef<string[]>([JSON.stringify(load())]);
  const step = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string; out: boolean }[]>([]);
  const prev = useRef(JSON.stringify(data));
  const tid = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = ++tid.current;
    setToasts(p => [...p, { id, msg, out: false }]);
    setTimeout(() => setToasts(p => p.map(t => t.id === id ? { ...t, out: true } : t)), 2200);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2600);
  }, []);

  // persist + history
  useEffect(() => {
    const json = JSON.stringify(data);
    if (json === prev.current) return;
    prev.current = json;
    try { localStorage.setItem('tireData', json); } catch { /* */ }
    if (step.current < hist.current.length - 1) {
      hist.current = hist.current.slice(0, step.current + 1);
    }
    hist.current.push(json);
    if (hist.current.length > 60) { hist.current.shift(); }
    else { step.current = hist.current.length - 1; }
    setCanUndo(step.current > 0);
    setCanRedo(false);
  }, [data]);

  const undo = useCallback(() => {
    if (step.current <= 0) return;
    step.current--;
    prev.current = hist.current[step.current];
    dispatch({ type: 'SET', d: JSON.parse(prev.current) });
    setCanUndo(step.current > 0);
    setCanRedo(true);
    toast('↶ Отменено');
  }, [toast]);

  const redo = useCallback(() => {
    if (step.current >= hist.current.length - 1) return;
    step.current++;
    prev.current = hist.current[step.current];
    dispatch({ type: 'SET', d: JSON.parse(prev.current) });
    setCanUndo(true);
    setCanRedo(step.current < hist.current.length - 1);
    toast('↷ Повтор');
  }, [toast]);

  const fmt = useCallback((v: number | string) => {
    let n = sf(v);
    if (data.settings.round) n = Math.round(n);
    const o = data.settings.decimals
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 0 };
    const f = n.toLocaleString('ru-RU', o);
    const c = data.settings.currency;
    return data.settings.currencyPos === 'left' ? `${c}\u00A0${f}` : `${f}\u00A0${c}`;
  }, [data.settings.round, data.settings.decimals, data.settings.currency, data.settings.currencyPos]);

  return (
    <C.Provider value={{ data, dispatch, undo, redo, canUndo, canRedo, fmt, toast, toasts }}>
      {children}
    </C.Provider>
  );
}

// ─── Icons (inline SVG) ──────────────────────────────────
const IC = {
  grid: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  dollar: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  minus: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  users: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  box: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
  clock: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  gear: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx={12} cy={12} r={3} /></svg>,
  trend: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  trash: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  undo: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" /></svg>,
  redo: <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-5-5M21 10l-5 5" /></svg>,
};

const TABS: { id: Tab; label: string; icon: React.ReactElement }[] = [
  { id: 'total', label: 'Обзор', icon: IC.grid },
  { id: 'income', label: 'Доходы', icon: IC.dollar },
  { id: 'expenses', label: 'Расходы', icon: IC.minus },
  { id: 'clients', label: 'Клиенты', icon: IC.users },
  { id: 'warehouse', label: 'Склад', icon: IC.box },
  { id: 'debts', label: 'Долги', icon: IC.clock },
  { id: 'settings', label: 'Настройки', icon: IC.gear },
];

// ─── Small components ────────────────────────────────────

/** Editable input that only commits on blur/Enter */
function TI({ value, onChange, type = 'text', placeholder, style, readOnly }: {
  value: string | number; onChange?: (v: string) => void; type?: string;
  placeholder?: string; style?: React.CSSProperties; readOnly?: boolean;
}) {
  const [loc, setLoc] = useState(String(value ?? ''));
  const ref = useRef(String(value ?? ''));

  useEffect(() => {
    const s = String(value ?? '');
    if (s !== ref.current) { setLoc(s); ref.current = s; }
  }, [value]);

  const commit = useCallback(() => {
    if (loc !== ref.current) { ref.current = loc; onChange?.(loc); }
  }, [loc, onChange]);

  return (
    <input type={type} value={loc} readOnly={readOnly} placeholder={placeholder}
      style={style} className="tinput"
      onChange={e => setLoc(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick} type="button" />;
}

function Modal({ open, onClose, onOk, title, text }: {
  open: boolean; onClose: () => void; onOk: () => void; title?: string; text?: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <h2 className="modal-title">{title || 'Подтверждение'}</h2>
        <p className="modal-text">{text || 'Это действие нельзя отменить. Продолжить?'}</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-danger" onClick={onOk}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts } = useS();
  return (
    <div className="toast-area">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.out ? 'out' : ''}`}>
          <span className="toast-icon">✓</span>{t.msg}
        </div>
      ))}
    </div>
  );
}

function useDeleter() {
  const { data, dispatch, toast } = useS();
  const [pend, setPend] = useState<{ col: keyof Data; id: string } | null>(null);
  const req = useCallback((col: keyof Data, id: string) => {
    if (data.settings.confirm) setPend({ col, id });
    else { dispatch({ type: 'DEL', col, id }); toast('Удалено'); }
  }, [data.settings.confirm, dispatch, toast]);
  const ok = useCallback(() => {
    if (pend) { dispatch({ type: 'DEL', col: pend.col, id: pend.id }); toast('Удалено'); }
    setPend(null);
  }, [pend, dispatch, toast]);
  const cancel = useCallback(() => setPend(null), []);
  return { open: !!pend, req, ok, cancel };
}

// ─── Calculator ──────────────────────────────────────────
function Calc({ show, close }: { show: boolean; close: () => void }) {
  const [disp, setDisp] = useState('0');
  const [prev, setPrev] = useState<string | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false); // after =, next digit replaces
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, x: 0, y: 0 });

  const num = (n: number) => {
    if (fresh) { setDisp(String(n)); setFresh(false); return; }
    setDisp(c => c === '0' ? String(n) : c + n);
  };
  const dot = () => { if (fresh) { setDisp('0.'); setFresh(false); return; } setDisp(c => c.includes('.') ? c : c + '.'); };
  const del = () => setDisp(c => c.length > 1 ? c.slice(0, -1) : '0');
  const clear = () => { setDisp('0'); setPrev(null); setOp(null); setFresh(false); };
  const neg = () => setDisp(c => c !== '0' ? (c.startsWith('-') ? c.slice(1) : '-' + c) : c);
  const doOp = (o: string) => { setPrev(disp); setDisp('0'); setOp(o); setFresh(false); };

  const eq = () => {
    if (!prev || !op) return;
    const a = sf(prev), b = sf(disp);
    let r = 0;
    if (op === '+') r = a + b;
    else if (op === '-') r = a - b;
    else if (op === '*') r = a * b;
    else if (op === '/') r = b !== 0 ? a / b : 0;
    setDisp(String(Math.round(r * 10000) / 10000));
    setPrev(null); setOp(null); setFresh(true);
  };

  const pd = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.calc-close')) return;
    const el = ref.current; if (!el) return;
    drag.current = { on: true, x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop };
    el.setPointerCapture(e.pointerId);
  };
  const pm = (e: React.PointerEvent) => {
    if (!drag.current.on || !ref.current) return;
    ref.current.style.left = (e.clientX - drag.current.x) + 'px';
    ref.current.style.top = (e.clientY - drag.current.y) + 'px';
    ref.current.style.right = 'auto'; ref.current.style.bottom = 'auto';
  };
  const pu = () => { drag.current.on = false; };

  if (!show) return null;
  return (
    <div ref={ref} className="mini-calc">
      <div className="calc-header" onPointerDown={pd} onPointerMove={pm} onPointerUp={pu}>
        <span>🧮 Калькулятор</span>
        <button className="calc-close" onClick={close}>✕</button>
      </div>
      <div className="calc-display">{disp}</div>
      <div className="calc-pad">
        <button className="calc-btn op" onClick={clear}>C</button>
        <button className="calc-btn op" onClick={neg}>±</button>
        <button className="calc-btn op" onClick={() => doOp('/')}>÷</button>
        <button className="calc-btn" onClick={del}>⌫</button>
        {[7, 8, 9].map(n => <button key={n} className="calc-btn" onClick={() => num(n)}>{n}</button>)}
        <button className="calc-btn op" onClick={() => doOp('*')}>×</button>
        {[4, 5, 6].map(n => <button key={n} className="calc-btn" onClick={() => num(n)}>{n}</button>)}
        <button className="calc-btn op" onClick={() => doOp('-')}>−</button>
        {[1, 2, 3].map(n => <button key={n} className="calc-btn" onClick={() => num(n)}>{n}</button>)}
        <button className="calc-btn op" onClick={() => doOp('+')}>+</button>
        <button className="calc-btn zero" onClick={() => num(0)}>0</button>
        <button className="calc-btn" onClick={dot}>.</button>
        <button className="calc-btn eq" onClick={eq}>=</button>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────
function DashboardTab() {
  const { data, fmt, dispatch, toast } = useS();
  const [search, setSearch] = useState('');
  const [cfmReset, setCfmReset] = useState(false);

  const stats = useMemo(() => {
    const t = td();
    const incT = data.income.filter(i => i.date === t).reduce((a, b) => a + sf(b.total), 0);
    const expT = data.expenses.filter(e => e.date === t).reduce((a, b) => a + sf(b.total), 0);
    const totI = data.income.reduce((a, b) => a + sf(b.total), 0);
    const totE = data.expenses.reduce((a, b) => a + sf(b.total), 0);
    const net = totI - totE;
    const debts = data.debts.filter(d => !d.paid).reduce((a, b) => a + sf(b.amount), 0);
    const avg = data.income.length ? totI / data.income.length : 0;
    const margin = totI ? ((totI - totE) / totI) * 100 : 0;
    const tax = net > 0 ? net * (data.settings.taxRate / 100) : 0;
    const days = new Set(data.income.map(i => i.date)).size || 1;
    const proj = (totI / days) * 30;
    const stV = data.warehouse.reduce((a, b) => a + sf(b.price) * sf(b.qty), 0);
    const stC = data.warehouse.reduce((a, b) => a + sf(b.qty), 0);
    const turn = totI + totE;
    const perC = data.clients.length ? totI / data.clients.length : 0;
    const eff = totE ? (totI / totE) * 100 : totI > 0 ? 100 : 0;
    const svc: Record<string, number> = {};
    data.income.forEach(i => { if (i.service) svc[i.service] = (svc[i.service] || 0) + 1; });
    const top = Object.entries(svc).sort((a, b) => b[1] - a[1])[0];
    return { incT, expT, net, debts, avg, margin, tax, proj, stV, stC, turn, perC, eff, top, cliN: data.clients.length };
  }, [data]);

  const res = useMemo(() => {
    if (!search.trim()) return [];
    const s = search.toLowerCase();
    return data.clients.filter(c => (c.name + c.phone + c.plate).toLowerCase().includes(s));
  }, [search, data.clients]);

  const doExport = () => {
    const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `shina_${td()}.json`; a.click();
    URL.revokeObjectURL(a.href); toast('📤 Экспорт завершён');
  };

  const doImport = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = (ev) => {
        try {
          const p = JSON.parse(ev.target!.result as string);
          if (!p.settings) throw 0;
          dispatch({ type: 'SET', d: { ...DD, ...p, settings: { ...DS, ...p.settings } } });
          toast('📥 База восстановлена');
        } catch { toast('❌ Ошибка чтения'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  };

  return (
    <div className="tab-anim">
      <div className="dash-grid">
        {[
          { icon: IC.dollar, l: 'Чистая прибыль', v: fmt(stats.net), sub: `Рентабельность: ${Math.round(stats.margin)}%`, sc: stats.margin >= 0 ? 'var(--success)' : 'var(--danger)' },
          { icon: IC.trend, l: 'Доход сегодня', v: fmt(stats.incT), sub: `Ср. чек: ${fmt(stats.avg)}` },
          { icon: IC.box, l: 'Склад', v: String(stats.stC) + ' шт', sub: `≈ ${fmt(stats.stV)}` },
        ].map((c, i) => (
          <div key={i} className="stat-card" style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="stat-icon">{c.icon}</div>
            <div>
              <div className="stat-label">{c.l}</div>
              <div className="stat-value">{c.v}</div>
            </div>
            <div className="stat-sub" style={c.sc ? { color: c.sc } : undefined}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="info-grid">
        {[
          { l: 'Расход сегодня', v: fmt(stats.expT) },
          { l: 'Налог (расч.)', v: fmt(stats.tax) },
          { l: 'Клиентов', v: String(stats.cliN) },
          { l: 'Сумма долгов', v: fmt(stats.debts), c: 'var(--danger)' },
          { l: 'Топ услуга', v: stats.top ? `${stats.top[0]} (${stats.top[1]})` : '—' },
          { l: 'Прогноз (мес)', v: fmt(stats.proj) },
          { l: 'Оборот', v: fmt(stats.turn) },
          { l: 'На клиента', v: fmt(stats.perC) },
          { l: 'Эффективность', v: `${Math.round(stats.eff)}%` },
        ].map((it, i) => (
          <div key={i} className="info-item" style={{ animationDelay: `${0.3 + i * 0.04}s` }}>
            <span className="info-label">{it.l}</span>
            <span className="info-val" style={it.c ? { color: it.c } : undefined}>{it.v}</span>
          </div>
        ))}
      </div>

      <div className="controls-bar" style={{ marginTop: 20 }}>
        <button className="btn btn-ghost" onClick={doImport}>📥 Импорт</button>
        <button className="btn btn-ghost" onClick={doExport}>📤 Экспорт</button>
        <button className="btn btn-danger" onClick={() => {
          if (data.settings.confirm) setCfmReset(true);
          else { dispatch({ type: 'CLEAR' }); toast('🗑 Сброс'); }
        }}>🗑 Сброс</button>
        <input className="search-input" placeholder="🔍 Поиск по базе..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {res.length > 0 && (
        <div className="search-results">
          {res.map(c => (
            <div key={c.id} className="search-result-item">
              <div className="search-result-name">{c.name || 'Без имени'}</div>
              <div className="search-result-info">{c.phone} • {c.plate}</div>
            </div>
          ))}
        </div>
      )}

      <Modal open={cfmReset} onClose={() => setCfmReset(false)}
        onOk={() => { dispatch({ type: 'CLEAR' }); toast('🗑 Данные сброшены'); setCfmReset(false); }}
        title="Сброс данных" text="Все данные будут удалены. Продолжить?" />
    </div>
  );
}

// ─── Income / Expenses ───────────────────────────────────
function IncExpTab({ type }: { type: 'income' | 'expenses' }) {
  const { data, dispatch, fmt, toast } = useS();
  const [search, setSearch] = useState('');
  const [sDir, setSDir] = useState(1);
  const { open, req, ok, cancel } = useDeleter();
  const isInc = type === 'income';
  const items = isInc ? data.income : data.expenses;
  const tplCat = isInc ? 'income' : 'expense';

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(i => Object.values(i).some(v => String(v).toLowerCase().includes(s)));
  }, [items, search]);

  const doSort = (k: string) => { dispatch({ type: 'SORT', col: type, k, dir: sDir }); setSDir(d => d * -1); };

  const updF = (id: string, k: string, v: string) => {
    const nameKey = isInc ? 'service' : 'desc';
    if (k === nameKey) {
      const tpl = data.templates.find(t => t.name.toLowerCase() === v.toLowerCase() && t.types.includes(tplCat));
      if (tpl) {
        dispatch({ type: 'UPD', col: type, id, k, v });
        dispatch({ type: 'CALC', col: type, id, k: 'price', v: tpl.price });
        dispatch({ type: 'CALC', col: type, id, k: 'qty', v: tpl.qty });
        toast(`📋 Шаблон «${tpl.name}»`);
        return;
      }
    }
    dispatch({ type: 'UPD', col: type, id, k, v });
  };

  const updN = (id: string, k: string, v: string) => {
    dispatch({ type: 'CALC', col: type, id, k, v: parseFloat(v) || 0 });
  };

  const hdr = ['Дата', isInc ? 'Услуга' : 'Описание', 'Цена', 'Кол-во', 'Итого', ''];
  const keys = ['date', isInc ? 'service' : 'desc', 'price', 'qty', 'total', ''];

  return (
    <div className="tab-anim">
      <div className="controls-bar">
        <button className={`btn ${isInc ? 'btn-success' : 'btn-danger'}`}
          onClick={() => dispatch({ type: 'ADD', col: type })}>
          + {isInc ? 'Доход' : 'Расход'}
        </button>
        <input className="search-input" placeholder={`🔍 Поиск...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="tbl-wrap">
        <div className="tbl-scroll">
          <table className="dtable m-cards">
            <thead><tr>
              {hdr.map((h, i) => (
                <th key={i} onClick={() => keys[i] && doSort(keys[i])}
                  className={keys[i] ? 'sortable' : ''}
                  style={{ width: [140, undefined, 100, 80, 120, 50][i] }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="empty-cell">Нет записей — нажмите «+ {isInc ? 'Доход' : 'Расход'}»</td></tr>
              )}
              {filtered.map((item, idx) => {
                const it = item as IncItem & ExpItem;
                return (
                  <tr key={it.id} className="row-anim" style={{ animationDelay: `${idx * 0.03}s` }}>
                    <td data-label="Дата"><TI type="date" value={it.date} onChange={v => updF(it.id, 'date', v)} /></td>
                    <td data-label={isInc ? 'Услуга' : 'Описание'}>
                      <TI value={isInc ? it.service : it.desc} onChange={v => updF(it.id, isInc ? 'service' : 'desc', v)} placeholder="..." />
                    </td>
                    <td data-label="Цена"><TI type="number" value={it.price} onChange={v => updN(it.id, 'price', v)} /></td>
                    <td data-label="Кол-во"><TI type="number" value={it.qty} onChange={v => updN(it.id, 'qty', v)} /></td>
                    <td data-label="Итого"><span className="total-badge">{fmt(it.total)}</span></td>
                    <td><button className="btn-trash" onClick={() => req(type, it.id)}>{IC.trash}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} onClose={cancel} onOk={ok} />
    </div>
  );
}

// ─── Clients ─────────────────────────────────────────────
function ClientsTab() {
  const { data, dispatch, toast } = useS();
  const [search, setSearch] = useState('');
  const { open, req, ok, cancel } = useDeleter();

  const filtered = useMemo(() => {
    if (!search) return data.clients;
    const s = search.toLowerCase();
    return data.clients.filter(c => (c.name + c.phone + c.plate).toLowerCase().includes(s));
  }, [data.clients, search]);

  const upd = (id: string, k: string, v: string) => {
    if (k === 'phone' && v.length > 5) {
      const ex = data.clients.find(c => c.phone === v && c.id !== id);
      if (ex) { dispatch({ type: 'MERGE_CLI', keep: ex.id, rm: id }); toast(`👥 Объединено: ${ex.name}`); return; }
    }
    dispatch({ type: 'UPD', col: 'clients', id, k, v });
  };

  return (
    <div className="tab-anim">
      <div className="controls-bar">
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'ADD', col: 'clients' })}>+ Клиент</button>
        <input className="search-input" placeholder="🔍 Имя, телефон, авто..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="dtable m-cards">
          <thead><tr>
            {['Дата', 'Имя', 'Телефон', 'Авто', 'Визиты', ''].map((h, i) =>
              <th key={i} style={{ width: [140, undefined, undefined, undefined, 80, 50][i] }}>{h}</th>
            )}
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="empty-cell">Нет клиентов</td></tr>}
            {filtered.map((c, idx) => (
              <tr key={c.id} className="row-anim" style={{ animationDelay: `${idx * 0.03}s` }}>
                <td data-label="Дата"><TI type="date" value={c.date} onChange={v => upd(c.id, 'date', v)} /></td>
                <td data-label="Имя"><TI value={c.name} onChange={v => upd(c.id, 'name', v)} placeholder="Имя" /></td>
                <td data-label="Телефон"><TI value={c.phone} onChange={v => upd(c.id, 'phone', v)} placeholder="+7..." /></td>
                <td data-label="Авто"><TI value={c.plate} onChange={v => upd(c.id, 'plate', v)} placeholder="А000АА" /></td>
                <td data-label="Визиты"><span className="total-badge">{c.visits || 1}</span></td>
                <td><button className="btn-trash" onClick={() => req('clients', c.id)}>{IC.trash}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      <Modal open={open} onClose={cancel} onOk={ok} />
    </div>
  );
}

// ─── Warehouse ───────────────────────────────────────────
function WarehouseTab() {
  const { data, dispatch, toast } = useS();
  const [search, setSearch] = useState('');
  const [sDir, setSDir] = useState(1);
  const { open, req, ok, cancel } = useDeleter();

  const filtered = useMemo(() => {
    if (!search) return data.warehouse;
    const s = search.toLowerCase();
    return data.warehouse.filter(w => w.name.toLowerCase().includes(s));
  }, [data.warehouse, search]);

  const doSort = (k: string) => { dispatch({ type: 'SORT', col: 'warehouse', k, dir: sDir }); setSDir(d => d * -1); };

  const upd = (id: string, k: string, v: string) => {
    if (k === 'name') {
      const tpl = data.templates.find(t => t.name.toLowerCase() === v.toLowerCase() && t.types.includes('warehouse'));
      if (tpl) {
        dispatch({ type: 'UPD', col: 'warehouse', id, k: 'name', v });
        dispatch({ type: 'UPD', col: 'warehouse', id, k: 'price', v: tpl.price });
        dispatch({ type: 'UPD', col: 'warehouse', id, k: 'qty', v: tpl.qty });
        toast(`📋 Шаблон «${tpl.name}»`);
        return;
      }
    }
    const val: string | number = (k === 'price' || k === 'qty') ? (parseFloat(v) || 0) : v;
    dispatch({ type: 'UPD', col: 'warehouse', id, k, v: val });
  };

  return (
    <div className="tab-anim">
      <div className="controls-bar">
        <button className="btn btn-warning" onClick={() => dispatch({ type: 'ADD', col: 'warehouse' })}>+ Товар</button>
        <input className="search-input" placeholder="🔍 Поиск товара..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="dtable m-cards">
          <thead><tr>
            <th className="sortable" onClick={() => doSort('name')}>Название</th>
            <th className="sortable" onClick={() => doSort('price')} style={{ width: 120 }}>Закупка</th>
            <th className="sortable" onClick={() => doSort('qty')} style={{ width: 100 }}>Остаток</th>
            <th style={{ width: 50 }} />
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={4} className="empty-cell">Нет товаров</td></tr>}
            {filtered.map((w, idx) => {
              const low = sf(w.qty) <= data.settings.lowStock && sf(w.qty) > 0;
              return (
                <tr key={w.id} className="row-anim" style={{ animationDelay: `${idx * 0.03}s`, borderLeft: low ? '3px solid var(--warning)' : undefined }}>
                  <td data-label="Название"><TI value={w.name} onChange={v => upd(w.id, 'name', v)} placeholder="Товар" /></td>
                  <td data-label="Закупка"><TI type="number" value={w.price} onChange={v => upd(w.id, 'price', v)} /></td>
                  <td data-label="Остаток">
                    <TI type="number" value={w.qty} onChange={v => upd(w.id, 'qty', v)}
                      style={low ? { color: 'var(--warning)', fontWeight: 700 } : undefined} />
                  </td>
                  <td><button className="btn-trash" onClick={() => req('warehouse', w.id)}>{IC.trash}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div>
      <Modal open={open} onClose={cancel} onOk={ok} />
    </div>
  );
}

// ─── Debts ───────────────────────────────────────────────
function DebtsTab() {
  const { data, dispatch, fmt } = useS();
  const [search, setSearch] = useState('');
  const { open, req, ok, cancel } = useDeleter();

  const filtered = useMemo(() => {
    if (!search) return data.debts;
    const s = search.toLowerCase();
    return data.debts.filter(d => (d.name + d.phone).toLowerCase().includes(s));
  }, [data.debts, search]);

  const totalDebt = useMemo(() => data.debts.filter(d => !d.paid).reduce((a, b) => a + sf(b.amount), 0), [data.debts]);

  const upd = (id: string, k: string, v: string | number) => {
    dispatch({ type: 'UPD', col: 'debts', id, k, v });
  };

  return (
    <div className="tab-anim">
      <div className="controls-bar">
        <button className="btn btn-danger" onClick={() => dispatch({ type: 'ADD', col: 'debts' })}>+ Долг</button>
        <input className="search-input" placeholder="🔍 Поиск должника..." value={search} onChange={e => setSearch(e.target.value)} />
        {totalDebt > 0 && <div className="debt-total">Итого: <strong style={{ color: 'var(--danger)' }}>{fmt(totalDebt)}</strong></div>}
      </div>
      <div className="tbl-wrap"><div className="tbl-scroll">
        <table className="dtable m-cards">
          <thead><tr>
            <th style={{ width: 140 }}>Дата</th><th>Имя</th><th>Телефон</th>
            <th style={{ width: 120 }}>Сумма</th><th style={{ width: 110 }}>Статус</th><th style={{ width: 50 }} />
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="empty-cell">Нет долгов 🎉</td></tr>}
            {filtered.map((d, idx) => (
              <tr key={d.id} className="row-anim" style={{ animationDelay: `${idx * 0.03}s`, opacity: d.paid ? .45 : 1 }}>
                <td data-label="Дата"><TI type="date" value={d.date} onChange={v => upd(d.id, 'date', v)} /></td>
                <td data-label="Имя"><TI value={d.name} onChange={v => upd(d.id, 'name', v)} placeholder="Имя" /></td>
                <td data-label="Телефон"><TI value={d.phone} onChange={v => upd(d.id, 'phone', v)} placeholder="+7..." /></td>
                <td data-label="Сумма"><TI type="number" value={d.amount} onChange={v => upd(d.id, 'amount', parseFloat(v) || 0)} /></td>
                <td data-label="Статус">
                  <button className={`btn btn-sm debt-toggle ${d.paid ? 'btn-success' : 'btn-danger'}`}
                    onClick={() => dispatch({ type: 'TOGGLE_DEBT', id: d.id })}>
                    {d.paid ? '✓ Оплачен' : '⏳ Долг'}
                  </button>
                </td>
                <td><button className="btn-trash" onClick={() => req('debts', d.id)}>{IC.trash}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      <Modal open={open} onClose={cancel} onOk={ok} />
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────
function SettingsTab() {
  const { data, dispatch, fmt, toast } = useS();
  const s = data.settings;
  const set = (p: Partial<Settings>) => dispatch({ type: 'SETTINGS', p });

  const [tN, setTN] = useState('');
  const [tP, setTP] = useState('');
  const [tQ, setTQ] = useState('1');
  const [tI, setTI2] = useState(true);
  const [tE, setTE] = useState(false);
  const [tW, setTW] = useState(false);

  const addTpl = () => {
    const types: string[] = [];
    if (tI) types.push('income');
    if (tE) types.push('expense');
    if (tW) types.push('warehouse');
    if (!tN.trim() || !types.length) { toast('⚠️ Имя + категория'); return; }
    dispatch({ type: 'ADD_TPL', t: { name: tN.trim(), price: parseFloat(tP) || 0, qty: parseFloat(tQ) || 1, types } });
    setTN(''); setTP('');
    toast('📋 Шаблон добавлен');
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="setting-row"><span>{label}</span><div>{children}</div></div>
  );

  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#06b6d4'];
  const catL: Record<string, string> = { income: 'Доход', expense: 'Расход', warehouse: 'Склад' };

  return (
    <div className="tab-anim">
      <div className="settings-grid">
        <div className="settings-group" style={{ animationDelay: '0s' }}>
          <h3 className="settings-title">🎨 Внешний вид</h3>
          <Row label="Дизайн">
            <select className="sel" value={s.design} onChange={e => set({ design: e.target.value as Settings['design'] })}>
              <option value="default">Стандарт</option>
              <option value="glass">Glass Future</option>
              <option value="soft">Soft Pro</option>
            </select>
          </Row>
          <Row label="Тёмная тема"><Toggle on={s.theme === 'dark'} onClick={() => set({ theme: s.theme === 'dark' ? 'light' : 'dark' })} /></Row>
          <Row label="Размер">
            <div className="scale-picker">
              {[{ v: '0.85', l: 'S' }, { v: '1', l: 'M' }, { v: '1.1', l: 'L' }].map(({ v, l }) => (
                <button key={v} className={`scale-btn ${s.scale === v ? 'active' : ''}`} onClick={() => set({ scale: v })}>{l}</button>
              ))}
            </div>
          </Row>
          <Row label="Анимации"><Toggle on={s.anim} onClick={() => set({ anim: !s.anim })} /></Row>
          <Row label="Компактные таблицы"><Toggle on={s.compact} onClick={() => set({ compact: !s.compact })} /></Row>
          <Row label="Акцент">
            <div className="color-picker">
              {colors.map(c => (
                <button key={c} className={`color-dot ${s.color === c ? 'active' : ''}`}
                  style={{ background: c }} onClick={() => set({ color: c })} />
              ))}
            </div>
          </Row>
        </div>

        <div className="settings-group" style={{ animationDelay: '0.1s' }}>
          <h3 className="settings-title">⚙️ Система</h3>
          <Row label="Валюта">
            <input className="mini-input" value={s.currency} onChange={e => set({ currency: e.target.value })} style={{ width: 50 }} />
          </Row>
          <Row label="Позиция валюты">
            <select className="sel" value={s.currencyPos} onChange={e => set({ currencyPos: e.target.value as 'left' | 'right' })}>
              <option value="right">100 ₽</option><option value="left">₽ 100</option>
            </select>
          </Row>
          <Row label="Налог (%)">
            <input className="mini-input" type="number" value={s.taxRate} onChange={e => set({ taxRate: parseFloat(e.target.value) || 0 })} style={{ width: 55 }} />
          </Row>
          <Row label="Формат даты">
            <select className="sel" value={s.dateFormat} onChange={e => set({ dateFormat: e.target.value as 'ru' | 'iso' })}>
              <option value="ru">ДД.ММ.ГГГГ</option><option value="iso">ГГГГ-ММ-ДД</option>
            </select>
          </Row>
          <Row label="Крит. остаток">
            <input className="mini-input" type="number" value={s.lowStock} onChange={e => set({ lowStock: parseFloat(e.target.value) || 0 })} style={{ width: 55 }} />
          </Row>
          <Row label="Округлять"><Toggle on={s.round} onClick={() => set({ round: !s.round })} /></Row>
          <Row label="Копейки"><Toggle on={s.decimals} onClick={() => set({ decimals: !s.decimals })} /></Row>
          <Row label="Подтверждать удаление"><Toggle on={s.confirm} onClick={() => set({ confirm: !s.confirm })} /></Row>
        </div>

        <div className="settings-group full-width" style={{ animationDelay: '0.2s' }}>
          <h3 className="settings-title">📋 Шаблоны быстрого ввода</h3>
          <div className="tpl-editor">
            <div className="tpl-inputs">
              <input className="search-input" value={tN} onChange={e => setTN(e.target.value)}
                placeholder="Название услуги / товара" style={{ flex: '1 1 200px' }} />
              <input className="search-input" type="number" value={tP} onChange={e => setTP(e.target.value)}
                placeholder="Цена" style={{ width: 100, flex: 'none' }} />
              <input className="search-input" type="number" value={tQ} onChange={e => setTQ(e.target.value)}
                placeholder="Кол-во" style={{ width: 80, flex: 'none' }} />
            </div>
            <div className="tpl-bottom">
              <div className="tpl-checks">
                <label className="check-label"><input type="checkbox" checked={tI} onChange={e => setTI2(e.target.checked)} /> Доходы</label>
                <label className="check-label"><input type="checkbox" checked={tE} onChange={e => setTE(e.target.checked)} /> Расходы</label>
                <label className="check-label"><input type="checkbox" checked={tW} onChange={e => setTW(e.target.checked)} /> Склад</label>
              </div>
              <button className="btn btn-success btn-sm" onClick={addTpl}>+ Шаблон</button>
            </div>
          </div>

          {data.templates.length > 0 && (
            <div className="tpl-list">
              {data.templates.map((t, i) => (
                <div key={i} className="tpl-card">
                  <div className="tpl-name">{t.name}</div>
                  <div className="tpl-meta">{t.qty} шт × {fmt(t.price)}</div>
                  <div className="tpl-tags">
                    {t.types.map(x => <span key={x} className="tpl-tag">{catL[x] || x}</span>)}
                  </div>
                  <button className="tpl-del" onClick={() => dispatch({ type: 'DEL_TPL', i })}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── App Shell ───────────────────────────────────────────
function Shell() {
  const { data, undo, redo, canUndo, canRedo } = useS();
  const [tab, setTab] = useState<Tab>('total');
  const [calc, setCalc] = useState(false);
  const s = data.settings;

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, redo]);

  // CSS custom props
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', s.color);
    const r = parseInt(s.color.slice(1, 3), 16);
    const g = parseInt(s.color.slice(3, 5), 16);
    const b = parseInt(s.color.slice(5, 7), 16);
    root.style.setProperty('--primary-rgb', `${r},${g},${b}`);
    root.style.setProperty('--primary-glow', `rgba(${r},${g},${b},0.3)`);
    root.style.setProperty('--font-scale', s.scale);
  }, [s.color, s.scale]);

  const cls = [
    s.theme === 'dark' ? 't-dark' : 't-light',
    s.design === 'glass' ? 'd-glass' : s.design === 'soft' ? 'd-soft' : '',
    !s.anim ? 'no-anim' : '',
    s.compact ? 'compact' : '',
  ].filter(Boolean).join(' ');

  const dateStr = useMemo(() =>
    new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
  , []);

  const label = TABS.find(t => t.id === tab)?.label || 'Обзор';

  return (
    <div className={`app-root ${cls}`}>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="logo-area">
            <div className="logo-icon">P</div>
            <span className="logo-text">ShinaPro</span>
          </div>
          <nav className="nav-menu">
            {TABS.map(t => (
              <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}>
                {t.icon}<span>{t.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="main-area">
          <header className="top-header">
            <div className="header-left">
              <div className="header-title">{label}</div>
              <div className="header-date">{dateStr}</div>
            </div>
            <div className="header-actions">
              <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Ctrl+Z">{IC.undo}</button>
              <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Ctrl+Y">{IC.redo}</button>
              <button className="icon-btn" onClick={() => setCalc(v => !v)} title="Калькулятор">
                <span style={{ fontSize: '1.1rem' }}>🧮</span>
              </button>
            </div>
          </header>

          <div className="content-scroll" key={tab}>
            {tab === 'total' && <DashboardTab />}
            {tab === 'income' && <IncExpTab type="income" />}
            {tab === 'expenses' && <IncExpTab type="expenses" />}
            {tab === 'clients' && <ClientsTab />}
            {tab === 'warehouse' && <WarehouseTab />}
            {tab === 'debts' && <DebtsTab />}
            {tab === 'settings' && <SettingsTab />}
          </div>
        </main>
      </div>

      <Calc show={calc} close={() => setCalc(false)} />
      <Toasts />
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────
export default function App() {
  return (
    <Provider>
      <Shell />
    </Provider>
  );
}
