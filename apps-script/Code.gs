/**
 * Backend do Chalé Serra do Cipó.
 *
 * Instalação inicial no projeto vinculado à planilha:
 * 1. Cole este arquivo no editor do Apps Script.
 * 2. Selecione e execute `configurarBancoDeDados` uma vez.
 * 3. Autorize o acesso solicitado.
 * 4. Publique uma NOVA VERSÃO da implantação do Web App.
 *
 * A função de configuração salva somente o ID da planilha nas propriedades do
 * script. Chaves de API continuam nas propriedades e nunca entram neste arquivo.
 */

const SHEET_KV = "KV";
const SPREADSHEET_ID_PROPERTY = "DATABASE_SPREADSHEET_ID";
const DEFAULT_SPREADSHEET_ID = "1TNx6ki-YiUPgYaa2SP-sFgrWhIC4w8AyKn2fVORkERM";

function configurarBancoDeDados() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
    || SpreadsheetApp.openById(DEFAULT_SPREADSHEET_ID);

  PropertiesService.getScriptProperties()
    .setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());

  garantirAbaKv_(spreadsheet);
  return `Banco configurado na planilha: ${spreadsheet.getName()}`;
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties()
    .getProperty(SPREADSHEET_ID_PROPERTY) || DEFAULT_SPREADSHEET_ID;

  return SpreadsheetApp.openById(id);
}

function garantirAbaKv_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(SHEET_KV);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_KV);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["key", "value", "updatedAt"]);
  }
  return sheet;
}

function getSheet_() {
  return garantirAbaKv_(getSpreadsheet_());
}

function encontrarLinha_(sheet, key) {
  const dados = sheet.getDataRange().getValues();
  for (let i = 1; i < dados.length; i += 1) {
    if (dados[i][0] === key) return i + 1;
  }
  return -1;
}

function lerValor_(key) {
  const sheet = getSheet_();
  const linha = encontrarLinha_(sheet, key);
  if (linha === -1) return null;
  return sheet.getRange(linha, 2).getValue();
}

function salvarValor_(key, value) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const linha = encontrarLinha_(sheet, key);
    const agora = new Date().toISOString();
    if (linha === -1) {
      sheet.appendRow([key, value, agora]);
    } else {
      sheet.getRange(linha, 2, 1, 2).setValues([[value, agora]]);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function responderJson_(resultado, callback) {
  const json = JSON.stringify(resultado);
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  try {
    if (params.action !== "get" || !params.key) {
      return responderJson_({ ok: false, error: "Ação ou chave inválida" }, params.callback);
    }
    return responderJson_({ ok: true, key: params.key, value: lerValor_(params.key) }, params.callback);
  } catch (error) {
    return responderJson_({ ok: false, error: String(error) }, params.callback);
  }
}

function doPost(e) {
  try {
    const corpo = JSON.parse(e.postData.contents);
    if (corpo.action === "set" && corpo.key) {
      salvarValor_(corpo.key, corpo.value);
      return responderJson_({ ok: true });
    }
    if (corpo.action === "ocr") {
      return responderJson_(lerComprovanteViaIA_(corpo.base64, corpo.mediaType, corpo.isPdf));
    }
    return responderJson_({ ok: false, error: "Ação inválida" });
  } catch (error) {
    return responderJson_({ ok: false, error: String(error) });
  }
}

function lerComprovanteViaIA_(base64, mediaType, isPdf) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) return { ok: false, error: "Integração de OCR não configurada." };

  const contentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: base64 } };

  const payload = {
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [contentBlock, {
        type: "text",
        text: 'Analise este comprovante de pagamento/depósito/transferência. Responda APENAS com um JSON puro, sem markdown e sem texto antes ou depois, no formato exato: {"valor": <número ou null>, "data": "<YYYY-MM-DD ou null>", "remetente": "<string ou null>"}. Use ponto como separador decimal no valor.',
      }],
    }],
  };

  const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const data = JSON.parse(response.getContentText());
  if (data.error) return { ok: false, error: data.error.message || "Erro na leitura do comprovante." };
  const textBlock = (data.content || []).find((block) => block.type === "text");
  if (!textBlock) return { ok: false, error: "A leitura não retornou texto." };

  try {
    const extraido = JSON.parse(textBlock.text.replace(/```json|```/g, "").trim());
    return { ok: true, ...extraido };
  } catch (error) {
    return { ok: false, error: "Não foi possível interpretar a leitura do comprovante." };
  }
}
