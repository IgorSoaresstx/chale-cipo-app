import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Home, CalendarDays, ClipboardList, Wallet, Receipt, Users, Wrench,
  BarChart3, LogOut, Upload, Camera, AlertTriangle, CheckCircle2, Settings,
  Plus, X, Loader2, TrendingUp, TrendingDown, ChevronLeft, ChevronRight,
  Trash2, Pencil, BadgeCheck, Clock, Star, FileWarning
} from "lucide-react";
import Papa from "papaparse";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from "recharts";

/* =========================================================================
   URL DO BACKEND (Google Apps Script)
   Depois de implantar o Code.gs (ver pasta apps-script/), cole aqui a URL
   que termina em /exec.
   ========================================================================= */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_kAqpOT4FtRhhhRzhmHKFYapv8RXc6si3mcCePlbweJvHpECSRga3keyh7_OLti1e/exec";

/* =========================================================================
   CONSTANTES E CHAVES DE ARMAZENAMENTO
   ========================================================================= */
const KEYS = {
  config: "config",
  reservas: "reservas",
  repasses: "repasses",
  despesas: "despesas",
  prestadores: "prestadores",
  lancamentos: "lancamentos-prestadores",
  manutencao: "manutencao-equipamentos",
  metas: "metas-mensais",
};

const DEFAULT_CONFIG = {
  pinDono: "",
  pinGestor: "",
  setupCompleto: false,
  comissaoPadrao: 20,
  valorFaxinaPadrao: 140,
  diaPagamentoPadrao: 10,
};

const CATEGORIAS_DESPESA = ["Jardinagem", "Faxina", "Manutenção", "Concessionária", "Documentação", "Outros"];
const TIPOS_PRESTADOR = ["Faxina", "Jardinagem", "Manutenção", "Gestão", "Outro"];

/* =========================================================================
   HELPERS — DATAS E DINHEIRO
   ========================================================================= */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatBRL(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseNumeroBR(str) {
  if (typeof str === "number") return str;
  if (!str) return 0;
  const limpo = String(str).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

function formatDateBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(iso) {
  return iso ? iso.slice(0, 7) : "";
}

function diffDias(isoA, isoB) {
  if (!isoA || !isoB) return 0;
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function addDiasISO(iso, dias) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function nomeMes(mesKey) {
  const [y, m] = mesKey.split("-");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function ultimosNMeses(n) {
  const out = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* =========================================================================
   ARMAZENAMENTO PERSISTENTE (Google Apps Script — mesma planilha, leitura via
   GET com CORS e escrita via POST text/plain sem leitura da resposta)
   ========================================================================= */
async function loadValue(key, fallback, { throwOnError = false } = {}) {
  try {
    const resp = await fetch(
      `${APPS_SCRIPT_URL}?action=get&key=${encodeURIComponent(key)}&_=${Date.now()}`,
      { method: "GET", cache: "no-store" },
    );
    if (!resp.ok) throw new Error(`Falha ao carregar a planilha (${resp.status})`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "O backend recusou a leitura");
    if (!data.ok || data.value === null || data.value === undefined || data.value === "") return fallback;
    return JSON.parse(data.value);
  } catch (e) {
    console.error("Erro ao carregar:", key, e);
    if (throwOnError) throw e;
    return fallback;
  }
}

async function saveValue(key, value) {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita pre-flight de CORS
      body: JSON.stringify({ action: "set", key, value: JSON.stringify(value) }),
    });

    // A resposta do Apps Script é opaca no navegador por causa do CORS.
    // Confirma a persistência relendo a mesma chave pelo canal JSONP.
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      if (tentativa > 0) await new Promise((resolve) => setTimeout(resolve, 350));
      const confirmado = await loadValue(key, null);
      if (JSON.stringify(confirmado) === JSON.stringify(value)) return true;
    }
    return false;
  } catch (e) {
    console.error("Erro ao salvar:", key, e);
    return false;
  }
}

/* =========================================================================
   COMPONENTES BASE DE UI
   ========================================================================= */
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white border border-stone-200 rounded-lg shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-md bg-emerald-700 text-emerald-50 flex items-center justify-center shrink-0">
            <Icon size={20} />
          </div>
        )}
        <div>
          <h2 className="text-xl font-serif font-semibold text-stone-900">{title}</h2>
          {subtitle && <p className="text-sm text-stone-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", className = "", type = "button", disabled }) {
  const base = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800",
    secondary: "bg-stone-100 text-stone-800 hover:bg-stone-200 border border-stone-300",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    ghost: "text-stone-600 hover:bg-stone-100",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-stone-500 mb-1 uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-400 mt-1">{hint}</span>}
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 ${props.className || ""}`}
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 ${props.className || ""}`}
    >
      {children}
    </select>
  );
}

function MoneyInput({ value, onChange, ...props }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">R$</span>
      <input
        {...props}
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseNumeroBR(e.target.value))}
        className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
      />
    </div>
  );
}

function Badge({ children, tone = "stone" }) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-700",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center py-12 text-stone-400">
      {Icon && <Icon size={32} className="mx-auto mb-3 opacity-50" />}
      <p className="font-medium text-stone-500">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-lg shadow-lg w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
          <h3 className="font-serif font-semibold text-lg text-stone-900">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Toast({ message, tone = "emerald", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  const tones = {
    emerald: "bg-emerald-700",
    rose: "bg-rose-600",
  };
  return (
    <div className={`fixed bottom-4 right-4 ${tones[tone]} text-white px-4 py-3 rounded-md shadow-lg z-[60] text-sm max-w-xs`}>
      {message}
    </div>
  );
}

/* =========================================================================
   LEITURA AUTOMÁTICA DE COMPROVANTE (via IA — chamada direta à API da Anthropic)
   ========================================================================= */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

async function lerComprovante(file) {
  const base64 = await fileToBase64(file);
  const isPdf = file.type === "application/pdf";

  const resp = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "ocr", base64, mediaType: file.type || "image/jpeg", isPdf }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || "Erro ao ler comprovante");
  return data;
}

function ReceiptUploader({ onExtracted, comprovanteAtual }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState(comprovanteAtual || "");

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setNomeArquivo(file.name);
    setErro("");
    setLoading(true);
    try {
      const extraido = await lerComprovante(file);
      onExtracted(extraido, file.name);
    } catch (err) {
      setErro("Não consegui ler o comprovante automaticamente — preencha manualmente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-dashed border-stone-300 rounded-md p-3 bg-stone-50">
      <label className="flex items-center gap-2 cursor-pointer text-sm text-emerald-700 font-medium">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
        {loading ? "Lendo comprovante..." : "Anexar comprovante (foto ou PDF)"}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} disabled={loading} />
      </label>
      {nomeArquivo && !loading && <p className="text-xs text-stone-500 mt-1">📎 {nomeArquivo}</p>}
      {erro && <p className="text-xs text-rose-600 mt-1">{erro}</p>}
    </div>
  );
}

/* =========================================================================
   LOGIN / CONFIGURAÇÃO INICIAL DE PIN
   ========================================================================= */
function TelaSetupInicial({ onConcluido }) {
  const [pinDono, setPinDono] = useState("");
  const [pinGestor, setPinGestor] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (pinDono.length < 4 || pinGestor.length < 4) {
      setErro("Use PINs com pelo menos 4 dígitos.");
      return;
    }
    if (pinDono === pinGestor) {
      setErro("Os PINs do dono e do gestor devem ser diferentes.");
      return;
    }
    setErro("");
    setSalvando(true);
    const config = { ...DEFAULT_CONFIG, pinDono, pinGestor, setupCompleto: true };
    const salvo = await saveValue(KEYS.config, config);
    if (!salvo) {
      setErro("Não foi possível salvar os acessos na planilha. Confira a implantação do Apps Script e tente novamente.");
      setSalvando(false);
      return;
    }

    const confirmado = await loadValue(KEYS.config, null);
    const persistiu = confirmado?.setupCompleto
      && confirmado.pinDono === pinDono
      && confirmado.pinGestor === pinGestor;
    if (!persistiu) {
      setErro("O backend respondeu, mas não devolveu os acessos gravados. Verifique a planilha e a versão implantada do Apps Script.");
      setSalvando(false);
      return;
    }

    onConcluido(confirmado);
  }

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6">
        <h1 className="text-2xl font-serif font-bold text-stone-900 mb-1">Configuração inicial</h1>
        <p className="text-sm text-stone-500 mb-6">Crie um PIN para você (dono) e outro para o gestor. Cada um usa o próprio PIN para entrar.</p>
        <Field label="PIN do dono">
          <Input type="password" inputMode="numeric" maxLength={6} value={pinDono} onChange={(e) => setPinDono(e.target.value.replace(/\D/g, ""))} placeholder="ex: 1234" />
        </Field>
        <Field label="PIN do gestor">
          <Input type="password" inputMode="numeric" maxLength={6} value={pinGestor} onChange={(e) => setPinGestor(e.target.value.replace(/\D/g, ""))} placeholder="ex: 5678" />
        </Field>
        {erro && <p className="text-sm text-rose-600 mb-3">{erro}</p>}
        <Button onClick={salvar} disabled={salvando} className="w-full">
          {salvando ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : "Criar acessos"}
        </Button>
        <p className="text-xs text-stone-400 mt-4">
          Os dados deste app ficam num armazenamento compartilhado do link do artefato — qualquer pessoa com o link consegue acessar. Não compartilhe o link à toa.
        </p>
      </Card>
    </div>
  );
}

function TelaLogin({ config, onEntrar }) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");

  function entrar() {
    if (pin === config.pinDono) onEntrar("dono");
    else if (pin === config.pinGestor) onEntrar("gestor");
    else setErro("PIN incorreto.");
  }

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
      <Card className="max-w-sm w-full p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-700 text-white flex items-center justify-center mx-auto mb-4">
          <Home size={26} />
        </div>
        <h1 className="text-xl font-serif font-bold text-stone-900">Chalé Serra do Cipó</h1>
        <p className="text-sm text-stone-500 mb-6">Controle de reservas e financeiro</p>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setErro(""); }}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          placeholder="Digite seu PIN"
          className="text-center text-lg tracking-widest mb-3"
        />
        {erro && <p className="text-sm text-rose-600 mb-3">{erro}</p>}
        <Button onClick={entrar} className="w-full">Entrar</Button>
      </Card>
    </div>
  );
}

/* =========================================================================
   NAVEGAÇÃO / SIDEBAR
   ========================================================================= */
const MENU_ITEMS = [
  { id: "dashboard", label: "Painel", icon: Home, donoOnly: false },
  { id: "financeiro", label: "Análise financeira", icon: BarChart3, donoOnly: true },
  { id: "calendario", label: "Calendário", icon: CalendarDays, donoOnly: false },
  { id: "reservas", label: "Reservas", icon: ClipboardList, donoOnly: false },
  { id: "repasses", label: "Repasses", icon: Wallet, donoOnly: false },
  { id: "despesas", label: "Despesas", icon: Receipt, donoOnly: false },
  { id: "prestadores", label: "Prestadores", icon: Users, donoOnly: true },
  { id: "manutencao", label: "Manutenção", icon: Wrench, donoOnly: false },
  { id: "config", label: "Configurações", icon: Settings, donoOnly: true },
];

function Sidebar({ view, setView, perfil, onSair, mobileOpen, setMobileOpen }) {
  const itens = MENU_ITEMS.filter((i) => !i.donoOnly || perfil === "dono");
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`fixed md:sticky top-0 h-screen w-64 bg-stone-900 text-stone-200 flex flex-col z-40 transition-transform ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="px-5 py-5 border-b border-stone-800">
          <h1 className="font-serif text-lg font-bold text-white leading-tight">Chalé Cipó</h1>
          <p className="text-xs text-stone-400">{perfil === "dono" ? "Acesso do dono" : "Acesso do gestor"}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {itens.map((item) => {
            const Icon = item.icon;
            const ativo = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setView(item.id); setMobileOpen(false); }}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  ativo ? "bg-emerald-700 text-white" : "text-stone-300 hover:bg-stone-800"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-stone-800">
          <button onClick={onSair} className="w-full flex items-center gap-2 text-sm text-stone-400 hover:text-white px-2 py-2">
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
    </>
  );
}

function TopBar({ titulo, onMenuClick }) {
  return (
    <div className="md:hidden flex items-center gap-3 bg-stone-900 text-white px-4 py-3 sticky top-0 z-20">
      <button onClick={onMenuClick} className="p-1">
        <ClipboardList size={20} />
      </button>
      <span className="font-serif font-semibold">{titulo}</span>
    </div>
  );
}

/* =========================================================================
   CÁLCULOS DE NEGÓCIO (compartilhados entre telas)
   ========================================================================= */
function valorLiquidoReserva(r) {
  return (Number(r.valorBruto) || 0) - (Number(r.taxaPlataforma) || 0);
}

function noitesReserva(r) {
  return Math.max(0, diffDias(r.checkin, r.checkout));
}

function gerarLancamentosAutomaticos(reserva, prestadores, lancamentosExistentes) {
  const novos = [];
  const faxina = prestadores.find((p) => p.tipo === "Faxina");
  if (faxina) {
    const existe = lancamentosExistentes.some((l) => l.prestadorId === faxina.id && l.origemReservaId === reserva.id);
    if (!existe) {
      novos.push({
        id: uid(), prestadorId: faxina.id, data: reserva.checkout,
        valor: Number(faxina.valorUnitario) || 0, origemReservaId: reserva.id,
        status: "pendente", descricao: `Faxina — checkout de ${reserva.hospede || "hóspede"} (${formatDateBR(reserva.checkout)})`,
      });
    }
  }
  const gestor = prestadores.find((p) => p.tipo === "Gestão");
  if (gestor) {
    const existe = lancamentosExistentes.some((l) => l.prestadorId === gestor.id && l.origemReservaId === reserva.id);
    if (!existe) {
      const pct = Number(gestor.valorUnitario) || 0;
      const comissao = valorLiquidoReserva(reserva) * (pct / 100);
      novos.push({
        id: uid(), prestadorId: gestor.id, data: reserva.checkout,
        valor: comissao, origemReservaId: reserva.id,
        status: "pendente", descricao: `Comissão ${pct}% — reserva de ${reserva.hospede || "hóspede"} (${formatDateBR(reserva.checkout)})`,
      });
    }
  }
  return novos;
}

function calcularAlertasInteligentes({ reservas, repasses, prestadores, lancamentos, manutencao }) {
  const alertas = [];
  const hoje = todayISO();

  // 1) Divergência repasse x esperado (mês atual)
  const mesAtual = monthKey(hoje);
  const reservasMes = reservas.filter((r) => monthKey(r.checkin) === mesAtual && r.status !== "Cancelada");
  const esperadoMes = reservasMes.reduce((s, r) => s + valorLiquidoReserva(r), 0);
  const repassadoMes = repasses.filter((p) => monthKey(p.data) === mesAtual).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const diferenca = esperadoMes - repassadoMes;
  if (Math.abs(diferenca) > 1) {
    alertas.push({
      tipo: diferenca > 0 ? "rose" : "amber",
      titulo: diferenca > 0 ? "Repasse abaixo do esperado este mês" : "Repasse acima do esperado este mês",
      detalhe: `Esperado: ${formatBRL(esperadoMes)} · Recebido: ${formatBRL(repassadoMes)} · Diferença: ${formatBRL(Math.abs(diferenca))}`,
    });
  }

  // 2) Repasse atrasado (checkout há mais de 15 dias sem repasse vinculado)
  reservas.filter((r) => r.status === "Concluída").forEach((r) => {
    const dias = diffDias(r.checkout, hoje);
    const temRepasse = repasses.some((p) => (p.reservasVinculadas || []).includes(r.id));
    if (dias > 15 && !temRepasse) {
      alertas.push({
        tipo: "rose",
        titulo: "Repasse atrasado",
        detalhe: `${r.hospede || "Reserva"} fez checkout há ${dias} dias e ainda não há repasse vinculado.`,
      });
    }
  });

  // 3) Buraco entre reservas (1-3 noites livres entre duas reservas confirmadas)
  const ordenadas = [...reservas].filter((r) => r.status !== "Cancelada" && r.checkout >= hoje)
    .sort((a, b) => (a.checkin < b.checkin ? -1 : 1));
  for (let i = 0; i < ordenadas.length - 1; i++) {
    const gap = diffDias(ordenadas[i].checkout, ordenadas[i + 1].checkin);
    if (gap >= 1 && gap <= 3) {
      alertas.push({
        tipo: "amber",
        titulo: "Janela curta entre reservas",
        detalhe: `${gap} noite(s) livre(s) entre ${formatDateBR(ordenadas[i].checkout)} e ${formatDateBR(ordenadas[i + 1].checkin)} — considere um preço promocional pra esse intervalo.`,
      });
    }
  }

  // 4) Vacância próxima (próximos 14 dias sem nenhuma reserva cobrindo)
  for (let d = 0; d < 14; d++) {
    const dia = addDiasISO(hoje, d);
    const ocupado = reservas.some((r) => r.status !== "Cancelada" && dia >= r.checkin && dia < r.checkout);
    if (!ocupado) {
      alertas.push({
        tipo: "amber",
        titulo: "Vacância nos próximos 14 dias",
        detalhe: `${formatDateBR(dia)} ainda está livre. Avalie reduzir o preço pra preencher.`,
      });
      break; // um alerta já é suficiente pra não poluir a tela
    }
  }

  // 5) Pagamentos a prestadores pendentes/próximos
  prestadores.forEach((p) => {
    const pendentes = lancamentos.filter((l) => l.prestadorId === p.id && l.status === "pendente");
    if (pendentes.length > 0) {
      const total = pendentes.reduce((s, l) => s + (Number(l.valor) || 0), 0);
      const diaHoje = new Date().getDate();
      const venceLogo = p.diaPagamento && Math.abs(diaHoje - Number(p.diaPagamento)) <= 3;
      alertas.push({
        tipo: venceLogo ? "rose" : "stone",
        titulo: `Pagamento pendente: ${p.nome}`,
        detalhe: `${formatBRL(total)} em ${pendentes.length} lançamento(s)${p.diaPagamento ? ` · pagamento todo dia ${p.diaPagamento}` : ""}`,
      });
    }
  });

  // 6) Manutenção próxima (30 dias)
  manutencao.forEach((m) => {
    if (!m.proximaData) return;
    const dias = diffDias(hoje, m.proximaData);
    if (dias >= 0 && dias <= 30) {
      alertas.push({
        tipo: dias <= 7 ? "rose" : "amber",
        titulo: `Manutenção: ${m.equipamento}`,
        detalhe: `Prevista para ${formatDateBR(m.proximaData)} (em ${dias} dia(s))`,
      });
    }
  });

  // 7) Avaliação em queda
  const comNota = reservas.filter((r) => r.avaliacao).sort((a, b) => (a.checkout < b.checkout ? -1 : 1));
  if (comNota.length >= 4) {
    const ultimas3 = comNota.slice(-3).reduce((s, r) => s + Number(r.avaliacao), 0) / 3;
    const anteriores = comNota.slice(0, -3).reduce((s, r) => s + Number(r.avaliacao), 0) / Math.max(1, comNota.length - 3);
    if (ultimas3 < anteriores - 0.4) {
      alertas.push({
        tipo: "amber",
        titulo: "Avaliações em queda",
        detalhe: `Média das últimas 3 estadias: ${ultimas3.toFixed(1)} (antes: ${anteriores.toFixed(1)})`,
      });
    }
  }

  // 8) Comparação com mesmo mês do ano anterior (sazonalidade)
  const [ano, mes] = mesAtual.split("-");
  const mesAnoAnterior = `${parseInt(ano, 10) - 1}-${mes}`;
  const reservasAnoAnterior = reservas.filter((r) => monthKey(r.checkin) === mesAnoAnterior && r.status !== "Cancelada");
  if (reservasAnoAnterior.length > 0) {
    const receitaAnoAnterior = reservasAnoAnterior.reduce((s, r) => s + valorLiquidoReserva(r), 0);
    const receitaAtual = esperadoMes;
    const variacao = receitaAnoAnterior > 0 ? ((receitaAtual - receitaAnoAnterior) / receitaAnoAnterior) * 100 : 0;
    if (Math.abs(variacao) >= 15) {
      alertas.push({
        tipo: variacao < 0 ? "rose" : "emerald",
        titulo: variacao < 0 ? "Receita abaixo do mesmo mês do ano passado" : "Receita acima do mesmo mês do ano passado",
        detalhe: `${nomeMes(mesAtual)}: ${formatBRL(receitaAtual)} vs ${nomeMes(mesAnoAnterior)}: ${formatBRL(receitaAnoAnterior)} (${variacao > 0 ? "+" : ""}${variacao.toFixed(0)}%)`,
      });
    }
  }

  return alertas;
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */
function CardKPI({ label, valor, icon: Icon, tone = "stone" }) {
  const tones = {
    stone: "text-stone-900", emerald: "text-emerald-700", rose: "text-rose-600", amber: "text-amber-700",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{label}</span>
        {Icon && <Icon size={16} className="text-stone-400" />}
      </div>
      <p className={`text-2xl font-mono font-semibold ${tones[tone]}`}>{valor}</p>
    </Card>
  );
}

function AlertaItem({ alerta }) {
  const cores = {
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    stone: "border-stone-200 bg-stone-50 text-stone-700",
  };
  return (
    <div className={`border rounded-md px-3 py-2.5 text-sm ${cores[alerta.tipo]}`}>
      <p className="font-medium flex items-center gap-1.5">
        <AlertTriangle size={14} className="shrink-0" /> {alerta.titulo}
      </p>
      <p className="text-xs mt-0.5 opacity-90">{alerta.detalhe}</p>
    </div>
  );
}

function DashboardView({ dados, perfil }) {
  const { reservas, repasses, despesas, prestadores, lancamentos, manutencao } = dados;
  const hoje = todayISO();
  const mesAtual = monthKey(hoje);

  const reservasMes = reservas.filter((r) => monthKey(r.checkin) === mesAtual && r.status !== "Cancelada");
  const receitaBruta = reservasMes.reduce((s, r) => s + (Number(r.valorBruto) || 0), 0);
  const esperadoMes = reservasMes.reduce((s, r) => s + valorLiquidoReserva(r), 0);
  const repassadoMes = repasses.filter((p) => monthKey(p.data) === mesAtual).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const despesasMes = despesas.filter((d) => monthKey(d.data) === mesAtual).reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const pagamentosPagosMes = lancamentos.filter((l) => l.status === "pago" && monthKey(l.dataPagamento) === mesAtual)
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const lucroLiquido = repassadoMes - despesasMes - pagamentosPagosMes;

  const noites = reservasMes.reduce((s, r) => s + noitesReserva(r), 0);
  const diasNoMes = new Date(parseInt(mesAtual.slice(0, 4)), parseInt(mesAtual.slice(5, 7)), 0).getDate();
  const ocupacao = diasNoMes > 0 ? (noites / diasNoMes) * 100 : 0;
  const adr = noites > 0 ? receitaBruta / noites : 0;

  const pendentesPrestadores = lancamentos.filter((l) => l.status === "pendente").reduce((s, l) => s + (Number(l.valor) || 0), 0);

  const alertas = useMemo(
    () => calcularAlertasInteligentes({ reservas, repasses, prestadores, lancamentos, manutencao }),
    [reservas, repasses, prestadores, lancamentos, manutencao]
  );

  if (perfil === "gestor") {
    // Visão simplificada para o gestor — sem lucro líquido / DRE
    const reservasConfirmadas = reservas.filter((r) => r.status === "Confirmada");
    return (
      <div>
        <SectionTitle icon={Home} title="Painel" subtitle={`Visão operacional — ${nomeMes(mesAtual)}`} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <CardKPI label="Reservas no mês" valor={reservasMes.length} icon={ClipboardList} />
          <CardKPI label="Repassado no mês" valor={formatBRL(repassadoMes)} icon={Wallet} tone="emerald" />
          <CardKPI label="Confirmadas (futuras)" valor={reservasConfirmadas.length} icon={CalendarDays} />
        </div>
        <h3 className="font-serif font-semibold text-stone-800 mb-2">Avisos</h3>
        <div className="space-y-2">
          {alertas.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tudo certo por aqui" />
          ) : (
            alertas.slice(0, 6).map((a, i) => <AlertaItem key={i} alerta={a} />)
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle icon={Home} title="Painel" subtitle={`Visão geral — ${nomeMes(mesAtual)}`} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <CardKPI label="Receita bruta" valor={formatBRL(receitaBruta)} icon={TrendingUp} />
        <CardKPI label="Repassado a você" valor={formatBRL(repassadoMes)} icon={Wallet} tone="emerald" />
        <CardKPI
          label="Diferença (esperado x repassado)"
          valor={formatBRL(Math.abs(esperadoMes - repassadoMes))}
          icon={esperadoMes - repassadoMes > 1 ? AlertTriangle : CheckCircle2}
          tone={esperadoMes - repassadoMes > 1 ? "rose" : "emerald"}
        />
        <CardKPI label="Lucro líquido do mês" valor={formatBRL(lucroLiquido)} icon={BarChart3} tone={lucroLiquido >= 0 ? "emerald" : "rose"} />
        <CardKPI label="Despesas do mês" valor={formatBRL(despesasMes)} icon={Receipt} />
        <CardKPI label="Pagamentos a prestadores pendentes" valor={formatBRL(pendentesPrestadores)} icon={Users} tone="amber" />
        <CardKPI label="Ocupação do mês" valor={`${ocupacao.toFixed(0)}%`} icon={CalendarDays} />
        <CardKPI label="Diária média (ADR)" valor={formatBRL(adr)} icon={TrendingUp} />
      </div>

      <h3 className="font-serif font-semibold text-stone-800 mb-2">Alertas inteligentes</h3>
      <div className="space-y-2">
        {alertas.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nenhum alerta no momento" subtitle="Tudo dentro do esperado." />
        ) : (
          alertas.map((a, i) => <AlertaItem key={i} alerta={a} />)
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   RESERVAS
   ========================================================================= */
const RESERVA_VAZIA = {
  hospede: "", checkin: "", checkout: "", plataforma: "Airbnb",
  valorBruto: 0, taxaPlataforma: 0, status: "Confirmada", avaliacao: "",
};

function FormReserva({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial || RESERVA_VAZIA);
  const liquido = (Number(form.valorBruto) || 0) - (Number(form.taxaPlataforma) || 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Hóspede">
          <Input value={form.hospede} onChange={(e) => setForm({ ...form, hospede: e.target.value })} />
        </Field>
        <Field label="Plataforma">
          <Select value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })}>
            <option>Airbnb</option><option>Booking</option><option>Direto</option>
          </Select>
        </Field>
        <Field label="Check-in">
          <Input type="date" value={form.checkin} onChange={(e) => setForm({ ...form, checkin: e.target.value })} />
        </Field>
        <Field label="Check-out">
          <Input type="date" value={form.checkout} onChange={(e) => setForm({ ...form, checkout: e.target.value })} />
        </Field>
        <Field label="Valor bruto">
          <MoneyInput value={form.valorBruto} onChange={(v) => setForm({ ...form, valorBruto: v })} />
        </Field>
        <Field label="Taxa da plataforma">
          <MoneyInput value={form.taxaPlataforma} onChange={(v) => setForm({ ...form, taxaPlataforma: v })} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option>Confirmada</option><option>Concluída</option><option>Cancelada</option>
          </Select>
        </Field>
        <Field label="Avaliação (1-5, opcional)">
          <Input type="number" min="1" max="5" value={form.avaliacao} onChange={(e) => setForm({ ...form, avaliacao: e.target.value })} />
        </Field>
      </div>
      <div className="bg-stone-50 border border-stone-200 rounded-md px-3 py-2 mb-4 text-sm flex justify-between">
        <span className="text-stone-500">Valor líquido esperado</span>
        <span className="font-mono font-semibold text-stone-800">{formatBRL(liquido)}</span>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={() => onSalvar(form)}>Salvar</Button>
      </div>
    </div>
  );
}

function ImportarCSVAirbnb({ onImportar, onFechar }) {
  const [linhas, setLinhas] = useState(null);
  const [colunas, setColunas] = useState([]);
  const [mapa, setMapa] = useState({ hospede: "", checkin: "", checkout: "", valorBruto: "", taxa: "" });

  function handleArquivo(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        setColunas(res.meta.fields || []);
        setLinhas(res.data);
        const achar = (palavras) => (res.meta.fields || []).find((c) => palavras.some((p) => c.toLowerCase().includes(p)));
        setMapa({
          hospede: achar(["hóspede", "hospede", "guest"]) || "",
          checkin: achar(["início", "inicio", "check-in", "start"]) || "",
          checkout: achar(["término", "termino", "check-out", "end"]) || "",
          valorBruto: achar(["valor bruto", "gross", "valor"]) || "",
          taxa: achar(["taxa de serviço", "taxa", "service fee"]) || "",
        });
      },
    });
  }

  function confirmar() {
    const reservasNovas = linhas
      .filter((l) => l[mapa.hospede] || l[mapa.checkin])
      .map((l) => ({
        id: uid(),
        hospede: l[mapa.hospede] || "Hóspede",
        checkin: l[mapa.checkin] ? new Date(l[mapa.checkin]).toISOString().slice(0, 10) : "",
        checkout: l[mapa.checkout] ? new Date(l[mapa.checkout]).toISOString().slice(0, 10) : "",
        valorBruto: parseNumeroBR(l[mapa.valorBruto]),
        taxaPlataforma: parseNumeroBR(l[mapa.taxa]),
        plataforma: "Airbnb",
        status: "Confirmada",
        avaliacao: "",
      }));
    onImportar(reservasNovas);
  }

  return (
    <div>
      {!linhas ? (
        <div>
          <p className="text-sm text-stone-500 mb-3">
            Baixe o histórico de transações no painel do Airbnb (Relatórios financeiros → Histórico de transações → Exportar CSV) e selecione o arquivo abaixo.
          </p>
          <input type="file" accept=".csv" onChange={handleArquivo} className="text-sm" />
        </div>
      ) : (
        <div>
          <p className="text-sm text-stone-500 mb-3">{linhas.length} linha(s) encontrada(s). Confirme quais colunas correspondem a cada campo:</p>
          {["hospede", "checkin", "checkout", "valorBruto", "taxa"].map((campo) => (
            <Field key={campo} label={campo}>
              <Select value={mapa[campo]} onChange={(e) => setMapa({ ...mapa, [campo]: e.target.value })}>
                <option value="">— não mapear —</option>
                {colunas.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          ))}
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
            <Button onClick={confirmar}>Importar {linhas.length} reserva(s)</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservasView({ dados, atualizar, perfil }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [modalImport, setModalImport] = useState(false);
  const [editando, setEditando] = useState(null);

  async function salvarReserva(form) {
    let lista = [...dados.reservas];
    let reservaSalva;
    if (editando && editando.id) {
      reservaSalva = { ...editando, ...form };
      lista = lista.map((r) => (r.id === editando.id ? reservaSalva : r));
    } else {
      reservaSalva = { ...form, id: uid() };
      lista.push(reservaSalva);
    }
    let lancamentos = dados.lancamentos;
    if (reservaSalva.status === "Concluída") {
      const novos = gerarLancamentosAutomaticos(reservaSalva, dados.prestadores, dados.lancamentos);
      if (novos.length) lancamentos = [...dados.lancamentos, ...novos];
    }
    await atualizar({ reservas: lista, lancamentos });
    setModalAberto(false);
    setEditando(null);
  }

  async function excluir(id) {
    if (!confirm("Excluir esta reserva?")) return;
    await atualizar({ reservas: dados.reservas.filter((r) => r.id !== id) });
  }

  async function importarCSV(novas) {
    await atualizar({ reservas: [...dados.reservas, ...novas] });
    setModalImport(false);
  }

  const ordenadas = [...dados.reservas].sort((a, b) => (a.checkin < b.checkin ? 1 : -1));

  return (
    <div>
      <SectionTitle
        icon={ClipboardList} title="Reservas" subtitle={`${dados.reservas.length} reserva(s) cadastradas`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setModalImport(true)}><Upload size={15} /> Importar CSV</Button>
            <Button onClick={() => { setEditando(null); setModalAberto(true); }}><Plus size={15} /> Nova</Button>
          </div>
        }
      />
      {ordenadas.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma reserva ainda" subtitle="Cadastre manualmente ou importe o CSV do Airbnb." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400 uppercase border-b border-stone-200">
                <th className="py-2 pr-3">Hóspede</th><th className="py-2 pr-3">Check-in</th><th className="py-2 pr-3">Check-out</th>
                <th className="py-2 pr-3">Bruto</th><th className="py-2 pr-3">Líquido</th><th className="py-2 pr-3">Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((r) => (
                <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="py-2 pr-3 font-medium text-stone-800">{r.hospede || "—"}</td>
                  <td className="py-2 pr-3 font-mono">{formatDateBR(r.checkin)}</td>
                  <td className="py-2 pr-3 font-mono">{formatDateBR(r.checkout)}</td>
                  <td className="py-2 pr-3 font-mono">{formatBRL(r.valorBruto)}</td>
                  <td className="py-2 pr-3 font-mono">{formatBRL(valorLiquidoReserva(r))}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={r.status === "Concluída" ? "emerald" : r.status === "Cancelada" ? "rose" : "amber"}>{r.status}</Badge>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => { setEditando(r); setModalAberto(true); }} className="text-stone-400 hover:text-emerald-700 p-1"><Pencil size={15} /></button>
                    {perfil === "dono" && (
                      <button onClick={() => excluir(r.id)} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar reserva" : "Nova reserva"} wide>
        <FormReserva inicial={editando} onSalvar={salvarReserva} onCancelar={() => setModalAberto(false)} />
      </Modal>
      <Modal open={modalImport} onClose={() => setModalImport(false)} title="Importar extrato do Airbnb" wide>
        <ImportarCSVAirbnb onImportar={importarCSV} onFechar={() => setModalImport(false)} />
      </Modal>
    </div>
  );
}

/* =========================================================================
   REPASSES DO GESTOR
   ========================================================================= */
function FormRepasse({ inicial, reservas, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial || { data: todayISO(), valor: 0, reservasVinculadas: [], observacao: "", comprovanteNome: "" });

  function toggleReserva(id) {
    const atual = form.reservasVinculadas || [];
    setForm({ ...form, reservasVinculadas: atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id] });
  }

  return (
    <div>
      <ReceiptUploader
        comprovanteAtual={form.comprovanteNome}
        onExtracted={(extraido, nome) => setForm({
          ...form,
          valor: extraido.valor ?? form.valor,
          data: extraido.data || form.data,
          observacao: extraido.remetente ? `Remetente: ${extraido.remetente}` : form.observacao,
          comprovanteNome: nome,
        })}
      />
      <div className="grid grid-cols-2 gap-x-3 mt-3">
        <Field label="Data do depósito">
          <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </Field>
        <Field label="Valor depositado">
          <MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
        </Field>
      </div>
      <Field label="Observação">
        <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
      </Field>
      <Field label="Reservas vinculadas a este repasse">
        <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-md p-2 space-y-1">
          {reservas.length === 0 && <p className="text-xs text-stone-400">Nenhuma reserva cadastrada ainda.</p>}
          {reservas.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm py-0.5">
              <input type="checkbox" checked={(form.reservasVinculadas || []).includes(r.id)} onChange={() => toggleReserva(r.id)} />
              {r.hospede || "Reserva"} — {formatDateBR(r.checkin)} ({formatBRL(valorLiquidoReserva(r))})
            </label>
          ))}
        </div>
      </Field>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={() => onSalvar(form)}>Salvar</Button>
      </div>
    </div>
  );
}

function RepassesView({ dados, atualizar }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  async function salvar(form) {
    let lista = [...dados.repasses];
    if (editando && editando.id) lista = lista.map((r) => (r.id === editando.id ? { ...editando, ...form } : r));
    else lista.push({ ...form, id: uid() });
    await atualizar({ repasses: lista });
    setModalAberto(false); setEditando(null);
  }

  async function excluir(id) {
    if (!confirm("Excluir este repasse?")) return;
    await atualizar({ repasses: dados.repasses.filter((r) => r.id !== id) });
  }

  const ordenados = [...dados.repasses].sort((a, b) => (a.data < b.data ? 1 : -1));

  return (
    <div>
      <SectionTitle icon={Wallet} title="Repasses do gestor" subtitle="Dinheiro que de fato caiu na sua conta"
        action={<Button onClick={() => { setEditando(null); setModalAberto(true); }}><Plus size={15} /> Novo</Button>} />
      {ordenados.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhum repasse registrado" />
      ) : (
        <div className="space-y-2">
          {ordenados.map((r) => (
            <Card key={r.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-mono font-semibold text-stone-800">{formatBRL(r.valor)}</p>
                <p className="text-xs text-stone-500">{formatDateBR(r.data)} · {(r.reservasVinculadas || []).length} reserva(s) vinculada(s)</p>
                {r.observacao && <p className="text-xs text-stone-400 mt-0.5">{r.observacao}</p>}
              </div>
              <div>
                <button onClick={() => { setEditando(r); setModalAberto(true); }} className="text-stone-400 hover:text-emerald-700 p-1"><Pencil size={15} /></button>
                <button onClick={() => excluir(r.id)} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar repasse" : "Novo repasse"} wide>
        <FormRepasse inicial={editando} reservas={dados.reservas} onSalvar={salvar} onCancelar={() => setModalAberto(false)} />
      </Modal>
    </div>
  );
}

/* =========================================================================
   DESPESAS
   ========================================================================= */
function FormDespesa({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial || { categoria: "Outros", recorrente: false, valor: 0, data: todayISO(), quemPagou: "Você", observacao: "", comprovanteNome: "" });
  return (
    <div>
      <ReceiptUploader
        comprovanteAtual={form.comprovanteNome}
        onExtracted={(extraido, nome) => setForm({
          ...form, valor: extraido.valor ?? form.valor, data: extraido.data || form.data, comprovanteNome: nome,
        })}
      />
      <div className="grid grid-cols-2 gap-x-3 mt-3">
        <Field label="Categoria">
          <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS_DESPESA.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Data">
          <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </Field>
        <Field label="Valor">
          <MoneyInput value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
        </Field>
        <Field label="Quem pagou">
          <Select value={form.quemPagou} onChange={(e) => setForm({ ...form, quemPagou: e.target.value })}>
            <option>Você</option><option>Gestor (descontado do repasse)</option>
          </Select>
        </Field>
      </div>
      <Field label="Recorrente?">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.recorrente} onChange={(e) => setForm({ ...form, recorrente: e.target.checked })} /> Sim, é uma despesa mensal fixa
        </label>
      </Field>
      <Field label="Observação">
        <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
      </Field>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={() => onSalvar(form)}>Salvar</Button>
      </div>
    </div>
  );
}

function DespesasView({ dados, atualizar }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  async function salvar(form) {
    let lista = [...dados.despesas];
    if (editando && editando.id) lista = lista.map((d) => (d.id === editando.id ? { ...editando, ...form } : d));
    else lista.push({ ...form, id: uid() });
    await atualizar({ despesas: lista });
    setModalAberto(false); setEditando(null);
  }

  async function excluir(id) {
    if (!confirm("Excluir esta despesa?")) return;
    await atualizar({ despesas: dados.despesas.filter((d) => d.id !== id) });
  }

  const ordenadas = [...dados.despesas].sort((a, b) => (a.data < b.data ? 1 : -1));

  return (
    <div>
      <SectionTitle icon={Receipt} title="Despesas" subtitle="Jardinagem, faxina, manutenção e outras"
        action={<Button onClick={() => { setEditando(null); setModalAberto(true); }}><Plus size={15} /> Nova</Button>} />
      {ordenadas.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma despesa registrada" />
      ) : (
        <div className="space-y-2">
          {ordenadas.map((d) => (
            <Card key={d.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge tone="stone">{d.categoria}</Badge>
                <div>
                  <p className="font-mono font-semibold text-stone-800">{formatBRL(d.valor)}</p>
                  <p className="text-xs text-stone-500">{formatDateBR(d.data)} · {d.quemPagou}{d.recorrente ? " · recorrente" : ""}</p>
                </div>
              </div>
              <div>
                <button onClick={() => { setEditando(d); setModalAberto(true); }} className="text-stone-400 hover:text-emerald-700 p-1"><Pencil size={15} /></button>
                <button onClick={() => excluir(d.id)} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar despesa" : "Nova despesa"} wide>
        <FormDespesa inicial={editando} onSalvar={salvar} onCancelar={() => setModalAberto(false)} />
      </Modal>
    </div>
  );
}

/* =========================================================================
   PRESTADORES DE SERVIÇO (e comissão do gestor)
   ========================================================================= */
function FormPrestador({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial || { nome: "", tipo: "Faxina", formaCobranca: "execucao", valorUnitario: 140, diaPagamento: 10, contato: "" });
  return (
    <div>
      <Field label="Nome">
        <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Tipo">
          <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_PRESTADOR.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Forma de cobrança">
          <Select value={form.formaCobranca} onChange={(e) => setForm({ ...form, formaCobranca: e.target.value })}>
            <option value="execucao">Por execução (ex: faxina)</option>
            <option value="fixo">Valor fixo mensal</option>
            <option value="percentual">% sobre o valor da reserva (ex: gestor)</option>
          </Select>
        </Field>
        <Field label={form.formaCobranca === "percentual" ? "Percentual (%)" : "Valor unitário"}>
          {form.formaCobranca === "percentual" ? (
            <Input type="number" value={form.valorUnitario} onChange={(e) => setForm({ ...form, valorUnitario: parseNumeroBR(e.target.value) })} />
          ) : (
            <MoneyInput value={form.valorUnitario} onChange={(v) => setForm({ ...form, valorUnitario: v })} />
          )}
        </Field>
        <Field label="Dia de pagamento">
          <Input type="number" min="1" max="31" value={form.diaPagamento} onChange={(e) => setForm({ ...form, diaPagamento: e.target.value })} />
        </Field>
      </div>
      <Field label="Contato (telefone/Pix)">
        <Input value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
      </Field>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={() => onSalvar(form)}>Salvar</Button>
      </div>
    </div>
  );
}

function ModalPagamento({ prestador, lancamentosPendentes, onConfirmar, onFechar }) {
  const [comprovanteNome, setComprovanteNome] = useState("");
  const [valorConfirmado, setValorConfirmado] = useState(lancamentosPendentes.reduce((s, l) => s + l.valor, 0));
  return (
    <div>
      <p className="text-sm text-stone-500 mb-3">{lancamentosPendentes.length} lançamento(s) pendente(s) de {prestador.nome}.</p>
      <ReceiptUploader
        comprovanteAtual={comprovanteNome}
        onExtracted={(extraido, nome) => { setComprovanteNome(nome); if (extraido.valor) setValorConfirmado(extraido.valor); }}
      />
      <Field label="Valor pago">
        <MoneyInput value={valorConfirmado} onChange={setValorConfirmado} />
      </Field>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
        <Button onClick={() => onConfirmar(comprovanteNome)}>Confirmar pagamento</Button>
      </div>
    </div>
  );
}

function PrestadoresView({ dados, atualizar }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pagandoPrestador, setPagandoPrestador] = useState(null);

  async function salvar(form) {
    let lista = [...dados.prestadores];
    if (editando && editando.id) lista = lista.map((p) => (p.id === editando.id ? { ...editando, ...form } : p));
    else lista.push({ ...form, id: uid() });
    await atualizar({ prestadores: lista });
    setModalAberto(false); setEditando(null);
  }

  async function excluir(id) {
    if (!confirm("Excluir este prestador?")) return;
    await atualizar({ prestadores: dados.prestadores.filter((p) => p.id !== id) });
  }

  async function lancarMensalidade(prestador) {
    const mes = monthKey(todayISO());
    const jaLancado = dados.lancamentos.some((l) => l.prestadorId === prestador.id && monthKey(l.data) === mes && l.origemReservaId === undefined);
    if (jaLancado) { alert("Já existe um lançamento desse mês pra esse prestador."); return; }
    const novo = { id: uid(), prestadorId: prestador.id, data: todayISO(), valor: Number(prestador.valorUnitario) || 0, status: "pendente", descricao: `Mensalidade ${nomeMes(mes)}` };
    await atualizar({ lancamentos: [...dados.lancamentos, novo] });
  }

  async function confirmarPagamento(comprovanteNome) {
    const ids = dados.lancamentos.filter((l) => l.prestadorId === pagandoPrestador.id && l.status === "pendente").map((l) => l.id);
    const lista = dados.lancamentos.map((l) => ids.includes(l.id) ? { ...l, status: "pago", dataPagamento: todayISO(), comprovanteNome } : l);
    await atualizar({ lancamentos: lista });
    setPagandoPrestador(null);
  }

  return (
    <div>
      <SectionTitle icon={Users} title="Prestadores de serviço" subtitle="Faxina, jardinagem, manutenção e comissão do gestor"
        action={<Button onClick={() => { setEditando(null); setModalAberto(true); }}><Plus size={15} /> Novo</Button>} />
      {dados.prestadores.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum prestador cadastrado" subtitle="Cadastre a faxineira, o jardineiro e o próprio gestor (comissão %)." />
      ) : (
        <div className="space-y-3">
          {dados.prestadores.map((p) => {
            const pendentes = dados.lancamentos.filter((l) => l.prestadorId === p.id && l.status === "pendente");
            const totalPendente = pendentes.reduce((s, l) => s + (Number(l.valor) || 0), 0);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-stone-800">{p.nome} <Badge tone="stone">{p.tipo}</Badge></p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {p.formaCobranca === "percentual" ? `${p.valorUnitario}% por reserva` : p.formaCobranca === "fixo" ? `${formatBRL(p.valorUnitario)}/mês` : `${formatBRL(p.valorUnitario)} por execução`}
                      {p.diaPagamento ? ` · pagamento dia ${p.diaPagamento}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {p.formaCobranca === "fixo" && (
                      <Button variant="secondary" onClick={() => lancarMensalidade(p)}>Lançar mês</Button>
                    )}
                    <button onClick={() => { setEditando(p); setModalAberto(true); }} className="text-stone-400 hover:text-emerald-700 p-2"><Pencil size={15} /></button>
                    <button onClick={() => excluir(p.id)} className="text-stone-400 hover:text-rose-600 p-2"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between bg-stone-50 rounded-md px-3 py-2">
                  <span className="text-sm text-stone-600">
                    Pendente: <span className="font-mono font-semibold">{formatBRL(totalPendente)}</span> em {pendentes.length} lançamento(s)
                  </span>
                  {pendentes.length > 0 && (
                    <Button variant="secondary" onClick={() => setPagandoPrestador(p)}>Registrar pagamento</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar prestador" : "Novo prestador"} wide>
        <FormPrestador inicial={editando} onSalvar={salvar} onCancelar={() => setModalAberto(false)} />
      </Modal>
      <Modal open={!!pagandoPrestador} onClose={() => setPagandoPrestador(null)} title={`Pagar ${pagandoPrestador?.nome || ""}`} wide>
        {pagandoPrestador && (
          <ModalPagamento
            prestador={pagandoPrestador}
            lancamentosPendentes={dados.lancamentos.filter((l) => l.prestadorId === pagandoPrestador.id && l.status === "pendente")}
            onConfirmar={confirmarPagamento}
            onFechar={() => setPagandoPrestador(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* =========================================================================
   ANÁLISE FINANCEIRA (DRE mensal + comparativo por período)
   ========================================================================= */
function calcularDREdoMes(mes, dados) {
  const { reservas, repasses, despesas, lancamentos } = dados;
  const reservasMes = reservas.filter((r) => monthKey(r.checkin) === mes && r.status !== "Cancelada");
  const receitaBruta = reservasMes.reduce((s, r) => s + (Number(r.valorBruto) || 0), 0);
  const taxaPlataforma = reservasMes.reduce((s, r) => s + (Number(r.taxaPlataforma) || 0), 0);
  const repassadoMes = repasses.filter((p) => monthKey(p.data) === mes).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const despesasMes = despesas.filter((d) => monthKey(d.data) === mes).reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const pagamentosMes = lancamentos.filter((l) => l.status === "pago" && monthKey(l.dataPagamento) === mes).reduce((s, l) => s + (Number(l.valor) || 0), 0);
  const lucroLiquido = repassadoMes - despesasMes - pagamentosMes;
  const margem = receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0;
  return { receitaBruta, taxaPlataforma, repassadoMes, despesasMes, pagamentosMes, lucroLiquido, margem };
}

function AnaliseFinanceiraView({ dados, atualizar }) {
  const [mesSelecionado, setMesSelecionado] = useState(monthKey(todayISO()));
  const dre = calcularDREdoMes(mesSelecionado, dados);
  const meses12 = ultimosNMeses(12);
  const serieGrafico = meses12.map((m) => {
    const d = calcularDREdoMes(m, dados);
    return { mes: nomeMes(m), Lucro: Math.round(d.lucroLiquido), Receita: Math.round(d.receitaBruta) };
  });

  const meta = (dados.metas || []).find((m) => m.mes === mesSelecionado);
  const [metaForm, setMetaForm] = useState(meta?.metaLucro || "");

  useEffect(() => { setMetaForm(meta?.metaLucro || ""); }, [mesSelecionado]);

  async function salvarMeta() {
    const outras = (dados.metas || []).filter((m) => m.mes !== mesSelecionado);
    await atualizar({ metas: [...outras, { mes: mesSelecionado, metaLucro: parseNumeroBR(metaForm) }] });
  }

  return (
    <div>
      <SectionTitle icon={BarChart3} title="Análise financeira" subtitle="DRE mensal e comparativo por período" />

      <div className="flex items-center gap-2 mb-4">
        <Button variant="secondary" onClick={() => {
          const [y, m] = mesSelecionado.split("-").map(Number);
          const d = new Date(y, m - 2, 1);
          setMesSelecionado(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }}><ChevronLeft size={15} /></Button>
        <span className="font-serif font-semibold text-stone-800 min-w-[100px] text-center">{nomeMes(mesSelecionado)}</span>
        <Button variant="secondary" onClick={() => {
          const [y, m] = mesSelecionado.split("-").map(Number);
          const d = new Date(y, m, 1);
          setMesSelecionado(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }}><ChevronRight size={15} /></Button>
      </div>

      <Card className="p-4 mb-6">
        <h3 className="font-serif font-semibold text-stone-800 mb-3">DRE — {nomeMes(mesSelecionado)}</h3>
        <table className="w-full text-sm font-mono">
          <tbody>
            <tr className="border-b border-stone-100"><td className="py-1.5">Receita bruta</td><td className="py-1.5 text-right">{formatBRL(dre.receitaBruta)}</td></tr>
            <tr className="border-b border-stone-100 text-stone-500"><td className="py-1.5">(−) Taxa da plataforma</td><td className="py-1.5 text-right">{formatBRL(dre.taxaPlataforma)}</td></tr>
            <tr className="border-b border-stone-100 text-stone-500"><td className="py-1.5">(−) Despesas</td><td className="py-1.5 text-right">{formatBRL(dre.despesasMes)}</td></tr>
            <tr className="border-b border-stone-100 text-stone-500"><td className="py-1.5">(−) Pagamentos a prestadores (inclui comissão)</td><td className="py-1.5 text-right">{formatBRL(dre.pagamentosMes)}</td></tr>
            <tr className="border-b border-stone-200"><td className="py-1.5 text-stone-500">Repassado pelo gestor</td><td className="py-1.5 text-right">{formatBRL(dre.repassadoMes)}</td></tr>
            <tr className="font-semibold text-base"><td className="py-2">Lucro líquido do mês</td><td className={`py-2 text-right ${dre.lucroLiquido >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{formatBRL(dre.lucroLiquido)}</td></tr>
            <tr className="text-xs text-stone-400"><td className="py-1">Margem líquida</td><td className="py-1 text-right">{dre.margem.toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </Card>

      <Card className="p-4 mb-6">
        <h3 className="font-serif font-semibold text-stone-800 mb-3">Meta de lucro do mês</h3>
        <div className="flex items-center gap-3">
          <MoneyInput value={metaForm} onChange={setMetaForm} />
          <Button onClick={salvarMeta}>Salvar meta</Button>
        </div>
        {meta && (
          <p className="text-sm text-stone-500 mt-2">
            Meta: {formatBRL(meta.metaLucro)} · Realizado: {formatBRL(dre.lucroLiquido)} ·{" "}
            <span className={dre.lucroLiquido >= meta.metaLucro ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
              {meta.metaLucro > 0 ? `${((dre.lucroLiquido / meta.metaLucro) * 100).toFixed(0)}% atingido` : ""}
            </span>
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-serif font-semibold text-stone-800 mb-3">Lucro líquido — últimos 12 meses</h3>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={serieGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatBRL(v)} />
              <Bar dataKey="Lucro" fill="#047857" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   CALENDÁRIO
   ========================================================================= */
function CalendarioView({ dados }) {
  const [ref, setRef] = useState(new Date());
  const ano = ref.getFullYear(), mes = ref.getMonth();
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hoje = todayISO();

  function statusDoDia(diaISO) {
    const reserva = dados.reservas.find((r) => r.status !== "Cancelada" && diaISO >= r.checkin && diaISO < r.checkout);
    return reserva;
  }

  const celulas = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);

  return (
    <div>
      <SectionTitle icon={CalendarDays} title="Calendário" subtitle="Ocupação visual do chalé" />
      <div className="flex items-center gap-2 mb-4">
        <Button variant="secondary" onClick={() => setRef(new Date(ano, mes - 1, 1))}><ChevronLeft size={15} /></Button>
        <span className="font-serif font-semibold text-stone-800 min-w-[140px] text-center">
          {ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <Button variant="secondary" onClick={() => setRef(new Date(ano, mes + 1, 1))}><ChevronRight size={15} /></Button>
      </div>
      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-400 mb-1">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celulas.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const reserva = statusDoDia(iso);
            const isHoje = iso === hoje;
            return (
              <div
                key={i}
                title={reserva ? reserva.hospede : "Livre"}
                className={`aspect-square rounded-md flex items-center justify-center text-xs font-mono relative
                  ${reserva ? "bg-emerald-600 text-white" : "bg-stone-50 text-stone-600"}
                  ${isHoje ? "ring-2 ring-amber-500" : ""}`}
              >
                {d}
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600 inline-block" /> Ocupado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-stone-50 border border-stone-200 inline-block" /> Livre</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded ring-2 ring-amber-500 inline-block" /> Hoje</span>
        </div>
      </Card>
    </div>
  );
}

/* =========================================================================
   MANUTENÇÃO DE EQUIPAMENTOS
   ========================================================================= */
function FormManutencao({ inicial, onSalvar, onCancelar }) {
  const [form, setForm] = useState(inicial || { equipamento: "", ultimaManutencao: todayISO(), intervaloMeses: 12 });
  return (
    <div>
      <Field label="Equipamento"><Input value={form.equipamento} onChange={(e) => setForm({ ...form, equipamento: e.target.value })} placeholder="ex: Aquecedor, filtro da piscina..." /></Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Última manutenção"><Input type="date" value={form.ultimaManutencao} onChange={(e) => setForm({ ...form, ultimaManutencao: e.target.value })} /></Field>
        <Field label="Intervalo (meses)"><Input type="number" value={form.intervaloMeses} onChange={(e) => setForm({ ...form, intervaloMeses: e.target.value })} /></Field>
      </div>
      <div className="flex gap-2 justify-end mt-3">
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
        <Button onClick={() => {
          const d = new Date(form.ultimaManutencao + "T00:00:00");
          d.setMonth(d.getMonth() + Number(form.intervaloMeses || 0));
          onSalvar({ ...form, proximaData: d.toISOString().slice(0, 10) });
        }}>Salvar</Button>
      </div>
    </div>
  );
}

function ManutencaoView({ dados, atualizar }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  async function salvar(form) {
    let lista = [...dados.manutencao];
    if (editando && editando.id) lista = lista.map((m) => (m.id === editando.id ? { ...editando, ...form } : m));
    else lista.push({ ...form, id: uid() });
    await atualizar({ manutencao: lista });
    setModalAberto(false); setEditando(null);
  }

  async function excluir(id) {
    if (!confirm("Excluir este item?")) return;
    await atualizar({ manutencao: dados.manutencao.filter((m) => m.id !== id) });
  }

  async function marcarFeita(item) {
    const hoje = todayISO();
    const d = new Date(hoje + "T00:00:00");
    d.setMonth(d.getMonth() + Number(item.intervaloMeses || 0));
    await atualizar({ manutencao: dados.manutencao.map((m) => m.id === item.id ? { ...m, ultimaManutencao: hoje, proximaData: d.toISOString().slice(0, 10) } : m) });
  }

  return (
    <div>
      <SectionTitle icon={Wrench} title="Manutenção" subtitle="Equipamentos e próximas datas"
        action={<Button onClick={() => { setEditando(null); setModalAberto(true); }}><Plus size={15} /> Novo</Button>} />
      {dados.manutencao.length === 0 ? (
        <EmptyState icon={Wrench} title="Nenhum equipamento cadastrado" />
      ) : (
        <div className="space-y-2">
          {dados.manutencao.map((m) => {
            const dias = diffDias(todayISO(), m.proximaData);
            const vencido = dias < 0;
            return (
              <Card key={m.id} className="p-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-medium text-stone-800">{m.equipamento}</p>
                  <p className="text-xs text-stone-500">
                    Última: {formatDateBR(m.ultimaManutencao)} · Próxima: {formatDateBR(m.proximaData)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {vencido ? <Badge tone="rose">Vencida</Badge> : dias <= 30 ? <Badge tone="amber">Em {dias}d</Badge> : <Badge tone="emerald">Em dia</Badge>}
                  <Button variant="secondary" onClick={() => marcarFeita(m)}>Marcar feita</Button>
                  <button onClick={() => { setEditando(m); setModalAberto(true); }} className="text-stone-400 hover:text-emerald-700 p-1"><Pencil size={15} /></button>
                  <button onClick={() => excluir(m.id)} className="text-stone-400 hover:text-rose-600 p-1"><Trash2 size={15} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? "Editar item" : "Novo item"}>
        <FormManutencao inicial={editando} onSalvar={salvar} onCancelar={() => setModalAberto(false)} />
      </Modal>
    </div>
  );
}

/* =========================================================================
   CONFIGURAÇÕES
   ========================================================================= */
function ConfigView({ config, onSalvarConfig }) {
  const [form, setForm] = useState(config);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");
  return (
    <div>
      <SectionTitle icon={Settings} title="Configurações" subtitle="Parâmetros do app" />
      <Card className="p-4 max-w-md">
        <Field label="PIN do dono"><Input value={form.pinDono} onChange={(e) => setForm({ ...form, pinDono: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="PIN do gestor"><Input value={form.pinGestor} onChange={(e) => setForm({ ...form, pinGestor: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Comissão padrão do gestor (%)" hint="Usado ao cadastrar o gestor como prestador">
          <Input type="number" value={form.comissaoPadrao} onChange={(e) => setForm({ ...form, comissaoPadrao: e.target.value })} />
        </Field>
        <Button onClick={async () => {
          setErro("");
          const ok = await onSalvarConfig(form);
          if (!ok) {
            setErro("Não foi possível salvar as configurações na planilha.");
            return;
          }
          setSalvo(true);
          setTimeout(() => setSalvo(false), 2000);
        }}>
          Salvar configurações
        </Button>
        {salvo && <p className="text-sm text-emerald-700 mt-2">Salvo!</p>}
        {erro && <p className="text-sm text-rose-600 mt-2">{erro}</p>}
      </Card>
      <Card className="p-4 max-w-md mt-4 bg-stone-50">
        <h3 className="font-serif font-semibold text-stone-800 mb-2 flex items-center gap-2"><FileWarning size={16} /> Fora do escopo desta versão</h3>
        <ul className="text-sm text-stone-600 list-disc pl-5 space-y-1">
          <li>Sincronização automática via iCal — agora é tecnicamente viável (o Apps Script pode buscar o feed sem bloqueio de CORS), mas ainda não está implementada</li>
          <li>Alertas por WhatsApp/e-mail (precisa de um serviço de envio integrado, ex: Twilio ou Gmail via Apps Script)</li>
          <li>Ajuste automático de preço direto no Airbnb (não há API pública pra isso)</li>
        </ul>
        <p className="text-xs text-stone-400 mt-2">Com o backend próprio (Apps Script) já no ar, esses itens passam a ser questão de pedir a próxima rodada de implementação.</p>
        <p className="text-xs text-stone-400 mt-2">URL do backend em uso: <span className="font-mono">{APPS_SCRIPT_URL}</span></p>
      </Card>
    </div>
  );
}

/* =========================================================================
   APP RAIZ
   ========================================================================= */
export default function App() {
  const [carregando, setCarregando] = useState(true);
  const [erroInicial, setErroInicial] = useState("");
  const [config, setConfig] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [view, setView] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [reservas, setReservas] = useState([]);
  const [repasses, setRepasses] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [prestadores, setPrestadores] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [manutencao, setManutencao] = useState([]);
  const [metas, setMetas] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, r, rp, d, p, l, m, mt] = await Promise.all([
          loadValue(KEYS.config, DEFAULT_CONFIG, { throwOnError: true }),
          loadValue(KEYS.reservas, []),
          loadValue(KEYS.repasses, []),
          loadValue(KEYS.despesas, []),
          loadValue(KEYS.prestadores, []),
          loadValue(KEYS.lancamentos, []),
          loadValue(KEYS.manutencao, []),
          loadValue(KEYS.metas, []),
        ]);
        setConfig(cfg); setReservas(r); setRepasses(rp); setDespesas(d);
        setPrestadores(p); setLancamentos(l); setManutencao(m); setMetas(mt);
      } catch (e) {
        setErroInicial("Não foi possível carregar a configuração compartilhada. Verifique a conexão e tente novamente.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const dados = { reservas, repasses, despesas, prestadores, lancamentos, manutencao, metas };

  // Atualiza estado local + persiste no storage. Recebe um objeto parcial, ex: { reservas: novaLista }
  const atualizar = useCallback(async (parcial) => {
    const setters = { reservas: setReservas, repasses: setRepasses, despesas: setDespesas, prestadores: setPrestadores, lancamentos: setLancamentos, manutencao: setManutencao, metas: setMetas };
    const keysMap = { reservas: KEYS.reservas, repasses: KEYS.repasses, despesas: KEYS.despesas, prestadores: KEYS.prestadores, lancamentos: KEYS.lancamentos, manutencao: KEYS.manutencao, metas: KEYS.metas };
    for (const campo of Object.keys(parcial)) {
      setters[campo](parcial[campo]);
      const ok = await saveValue(keysMap[campo], parcial[campo]);
      if (!ok) setToast("Não consegui salvar — tente de novo.");
    }
  }, []);

  async function salvarConfig(novaConfig) {
    const ok = await saveValue(KEYS.config, novaConfig);
    if (ok) setConfig(novaConfig);
    return ok;
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
      </div>
    );
  }

  if (erroInicial) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <FileWarning size={32} className="text-amber-600 mx-auto mb-3" />
          <h1 className="text-xl font-serif font-bold text-stone-900 mb-2">Não foi possível carregar o sistema</h1>
          <p className="text-sm text-stone-600 mb-5">{erroInicial}</p>
          <Button onClick={() => window.location.reload()} className="w-full">Tentar novamente</Button>
        </Card>
      </div>
    );
  }

  if (!config.setupCompleto) {
    return <TelaSetupInicial onConcluido={(cfg) => setConfig(cfg)} />;
  }

  if (!perfil) {
    return <TelaLogin config={config} onEntrar={setPerfil} />;
  }

  const titulos = {
    dashboard: "Painel", financeiro: "Análise financeira", calendario: "Calendário", reservas: "Reservas",
    repasses: "Repasses", despesas: "Despesas", prestadores: "Prestadores", manutencao: "Manutenção", config: "Configurações",
  };

  return (
    <div className="min-h-screen bg-stone-50 flex font-sans">
      <Sidebar view={view} setView={setView} perfil={perfil} onSair={() => setPerfil(null)} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="flex-1 min-w-0">
        <TopBar titulo={titulos[view]} onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 md:p-8 max-w-5xl mx-auto">
          {view === "dashboard" && <DashboardView dados={dados} perfil={perfil} />}
          {view === "financeiro" && perfil === "dono" && <AnaliseFinanceiraView dados={dados} atualizar={atualizar} />}
          {view === "calendario" && <CalendarioView dados={dados} />}
          {view === "reservas" && <ReservasView dados={dados} atualizar={atualizar} perfil={perfil} />}
          {view === "repasses" && <RepassesView dados={dados} atualizar={atualizar} />}
          {view === "despesas" && <DespesasView dados={dados} atualizar={atualizar} />}
          {view === "prestadores" && perfil === "dono" && <PrestadoresView dados={dados} atualizar={atualizar} />}
          {view === "manutencao" && <ManutencaoView dados={dados} atualizar={atualizar} />}
          {view === "config" && perfil === "dono" && <ConfigView config={config} onSalvarConfig={salvarConfig} />}
        </main>
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
