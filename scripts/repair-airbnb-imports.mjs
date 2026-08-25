import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_kAqpOT4FtRhhhRzhmHKFYapv8RXc6si3mcCePlbweJvHpECSRga3keyh7_OLti1e/exec";
const pasta = process.argv[2];
if (!pasta) throw new Error("Informe a pasta que contém os CSVs do Airbnb.");

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const numero = (valor) => Number(String(valor || "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
const data = (valor) => {
  const partes = String(valor || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return partes ? `${partes[3]}-${partes[1].padStart(2, "0")}-${partes[2].padStart(2, "0")}` : "";
};

async function ler(key) {
  let erro;
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      const resposta = await fetch(`${APPS_SCRIPT_URL}?action=get&key=${encodeURIComponent(key)}&_=${Date.now()}-${tentativa}`);
      const texto = await resposta.text();
      const json = JSON.parse(texto);
      if (!json.ok) throw new Error(json.error || `Falha ao ler ${key}`);
      return json.value ? JSON.parse(json.value) : [];
    } catch (e) {
      erro = e;
      await new Promise((resolve) => setTimeout(resolve, tentativa * 1000));
    }
  }
  throw erro;
}

async function salvar(key, value) {
  let erro;
  for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
    try {
      const resposta = await fetch(APPS_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "set", key, value: JSON.stringify(value) }),
      });
      const texto = await resposta.text();
      const json = JSON.parse(texto);
      if (!json.ok) throw new Error(`Falha ao salvar ${key}`);
      return;
    } catch (e) {
      erro = e;
      await new Promise((resolve) => setTimeout(resolve, tentativa * 1000));
    }
  }
  throw erro;
}

const arquivos = fs.readdirSync(pasta).filter((nome) => /^airbnb_.*\.csv$/i.test(nome)).sort();
const linhas = arquivos.flatMap((arquivo) => Papa.parse(fs.readFileSync(path.join(pasta, arquivo), "utf8"), { header: true, skipEmptyLines: true }).data.map((linha) => ({ ...linha, __arquivo: arquivo })));
const [reservasAtuais, repassesAtuais, prestadoresAtuais, lancamentosAtuais] = await Promise.all([
  ler("reservas"), ler("repasses"), ler("prestadores"), ler("lancamentos-prestadores"),
]);

const reservasPorCodigo = new Map(reservasAtuais.map((r) => [r.codigoConfirmacao || `${r.checkin}|${r.checkout}|${r.hospede}`, r]));
for (const linha of linhas.filter((l) => l.Tipo === "Reserva")) {
  const checkin = data(linha["Data de início"]);
  const checkout = data(linha["Data de término"]);
  const codigo = String(linha["Código de Confirmação"] || "").trim();
  const hospede = String(linha.Hóspede || "Hóspede").trim();
  const chave = codigo || `${checkin}|${checkout}|${hospede}`;
  const existente = reservasPorCodigo.get(chave) || {};
  reservasPorCodigo.set(chave, {
    ...existente, id: existente.id || uid(), codigoConfirmacao: codigo, hospede, checkin, checkout,
    valorBruto: numero(linha["Ganhos brutos"]), valorLiquidoAirbnb: numero(linha.Valor),
    taxaPlataforma: numero(linha["Taxa de serviço"]), taxaLimpezaAirbnb: numero(linha["Taxa de limpeza"]),
    dataPagamentoAirbnb: data(linha.Data), plataforma: "Airbnb",
    status: checkout && checkout < new Date().toISOString().slice(0, 10) ? "Concluída" : "Confirmada",
    avaliacao: existente.avaliacao || "", origemArquivo: linha.__arquivo,
  });
}
const reservas = [...reservasPorCodigo.values()];

const repassesPorCodigo = new Map(repassesAtuais.filter((r) => r.codigoReferenciaAirbnb).map((r) => [r.codigoReferenciaAirbnb, r]));
for (const linha of linhas.filter((l) => l.Tipo === "Payout")) {
  const codigo = String(linha["Código de referência"] || "").trim();
  const existente = repassesPorCodigo.get(codigo) || {};
  repassesPorCodigo.set(codigo, {
    ...existente, id: existente.id || uid(), data: data(linha.Data), valor: numero(linha.Pago),
    codigoReferenciaAirbnb: codigo, observacao: String(linha.Informações || "Repasse Airbnb").trim(),
    comprovanteNome: linha.__arquivo, reservasVinculadas: existente.reservasVinculadas || [], origemArquivo: linha.__arquivo,
  });
}
const repasses = [...repassesPorCodigo.values()];

const prestadores = [...prestadoresAtuais];
let faxina = prestadores.find((p) => p.tipo === "Faxina");
if (!faxina) {
  faxina = { id: uid(), nome: "Faxina do chalé", tipo: "Faxina", formaCobranca: "execucao", valorUnitario: 140, diaPagamento: 10, contato: "" };
  prestadores.push(faxina);
}
const lancamentos = [...lancamentosAtuais];
for (const reserva of reservas) {
  const existe = lancamentos.some((l) => l.origemReservaId === reserva.id && (l.tipo === "faxina" || l.prestadorId === faxina.id));
  if (!existe) lancamentos.push({
    id: uid(), tipo: "faxina", previsao: true, prestadorId: faxina.id, data: reserva.checkout,
    valor: 140, origemReservaId: reserva.id, status: "pendente",
    descricao: `Previsão de faxina — checkout de ${reserva.hospede}`,
  });
}

await salvar("reservas", reservas);
await salvar("repasses", repasses);
await salvar("prestadores", prestadores);
await salvar("lancamentos-prestadores", lancamentos);

console.log(JSON.stringify({ arquivos: arquivos.length, reservas: reservas.length, repasses: repasses.length, faxinas: lancamentos.filter((l) => l.tipo === "faxina" || l.prestadorId === faxina.id).length }, null, 2));
