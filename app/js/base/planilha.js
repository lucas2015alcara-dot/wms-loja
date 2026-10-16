"use strict";
// WMS Pilchs — js/base/planilha.js
// Gera planilhas .xlsx formatadas direto no navegador, sem biblioteca de fora.
// Abre no Google Planilhas (arraste para o Drive ou Arquivo → Importar) e no Excel.
//
// Por que .xlsx e não CSV: o CSV não guarda formatação e o Google Planilhas
// "come" o zero da frente dos SKUs (0653969769473 → 653969769473).
// Aqui SKU e textos vão sempre como TEXTO, datas como data e números como número.
//
// Uso:
// baixarPlanilha({
//   arquivo: "WMS - Problemas - 16-09-2026 a 16-10-2026.xlsx",
//   titulo: "Problemas no período",
//   periodo: "16/09/2026 a 16/10/2026",          // opcional
//   secoes: [{ titulo: "Totais", linhas: [["Reportados", 6], ...] }, ...],  // aba Resumo
//   colunas: [{ t: "Aberto em", tipo: "data", w: 17 }, ...],   // tipo: texto | sku | num | data | status | dif
//   linhas: [[new Date(), "2000055", ...], ...],
//   status: { "Em aberto": "vermelho", "Resolvido": "verde", ... }   // cor das colunas tipo "status"
// });

var PL_ESTILO = {
  padrao: 0, cab: 1, txt: 2, txtZ: 3, num: 4, numZ: 5, data: 6, dataZ: 7,
  vermelho: 8, verde: 9, amarelo: 10, cinza: 11,
  titulo: 12, sub: 13, rotulo: 14, valor: 15, secao: 16, valorTxt: 17
};

function plEsc(v) {
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function plCol(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function plDataSerial(d) { return (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569; }

function plCelula(ref, v, estilo, forcarTexto) {
  if (v === null || v === undefined || v === "") return '<c r="' + ref + '" s="' + estilo + '"/>';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '<c r="' + ref + '" s="' + estilo + '"/>';
    return '<c r="' + ref + '" s="' + estilo + '"><v>' + plDataSerial(v) + '</v></c>';
  }
  if (typeof v === "number" && isFinite(v) && !forcarTexto) return '<c r="' + ref + '" s="' + estilo + '"><v>' + v + '</v></c>';
  return '<c r="' + ref + '" s="' + estilo + '" t="inlineStr"><is><t xml:space="preserve">' + plEsc(v) + '</t></is></c>';
}

function plAbaResumo(cfg) {
  var linhas = [], merges = [], r = 1;
  var gerado = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  linhas.push('<row r="1" ht="28" customHeight="1">' + plCelula("A1", cfg.titulo, PL_ESTILO.titulo) + '</row>');
  merges.push("A1:C1");
  r = 2;
  if (cfg.periodo) { linhas.push('<row r="' + r + '">' + plCelula("A" + r, "Período: " + cfg.periodo, PL_ESTILO.sub) + '</row>'); merges.push("A" + r + ":C" + r); r++; }
  linhas.push('<row r="' + r + '">' + plCelula("A" + r, "Gerado em " + gerado + (typeof meu !== "undefined" && meu && meu.nome ? " por " + meu.nome : "") + " · WMS Pilchs Info", PL_ESTILO.sub) + '</row>');
  merges.push("A" + r + ":C" + r); r++;
  linhas.push('<row r="' + r + '">' + plCelula("A" + r, "Os dados completos estão na aba \"Dados\".", PL_ESTILO.sub) + '</row>');
  merges.push("A" + r + ":C" + r); r += 2;
  (cfg.secoes || []).forEach(function (sec) {
    if (!sec.linhas || !sec.linhas.length) return;
    linhas.push('<row r="' + r + '" ht="20" customHeight="1">' + plCelula("A" + r, sec.titulo, PL_ESTILO.secao) + plCelula("B" + r, "", PL_ESTILO.secao) + '</row>');
    r++;
    sec.linhas.forEach(function (l) {
      var num = typeof l[1] === "number";
      linhas.push('<row r="' + r + '">' + plCelula("A" + r, l[0], PL_ESTILO.rotulo, true) + plCelula("B" + r, l[1], num ? PL_ESTILO.valor : PL_ESTILO.valorTxt) + '</row>');
      r++;
    });
    r++;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0" tabSelected="1" showGridLines="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16"/>' +
    '<cols><col min="1" max="1" width="44" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/></cols>' +
    '<sheetData>' + linhas.join("") + '</sheetData>' +
    '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + '</mergeCells>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '</worksheet>';
}

function plAbaDados(cfg) {
  var cols = cfg.colunas, n = cfg.linhas.length;
  var ultima = plCol(cols.length - 1);
  var out = ['<row r="1" ht="22" customHeight="1">' + cols.map(function (c, i) { return plCelula(plCol(i) + "1", c.t, PL_ESTILO.cab); }).join("") + '</row>'];
  cfg.linhas.forEach(function (l, k) {
    var r = k + 2, z = k % 2 === 1;
    out.push('<row r="' + r + '">' + cols.map(function (c, i) {
      var v = l[i], s;
      if (c.tipo === "num" || c.tipo === "dif") {
        s = z ? PL_ESTILO.numZ : PL_ESTILO.num;
        if (c.tipo === "dif" && typeof v === "number" && v !== 0) s = v < 0 ? PL_ESTILO.vermelho : PL_ESTILO.verde;
        if (typeof v === "string" && v !== "" && !isNaN(Number(v))) v = Number(v);
      } else if (c.tipo === "data") s = z ? PL_ESTILO.dataZ : PL_ESTILO.data;
      else if (c.tipo === "status") s = PL_ESTILO[(cfg.status || {})[v]] || (z ? PL_ESTILO.txtZ : PL_ESTILO.txt);
      else s = z ? PL_ESTILO.txtZ : PL_ESTILO.txt;
      var texto = c.tipo === "texto" || c.tipo === "sku" || c.tipo === "status" || !c.tipo;
      return plCelula(plCol(i) + r, texto && v !== null && v !== undefined ? String(v) : v, s, texto);
    }).join("") + '</row>');
  });
  var ref = "A1:" + ultima + Math.max(n + 1, 1);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<dimension ref="' + ref + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16"/>' +
    '<cols>' + cols.map(function (c, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 14) + '" customWidth="1"/>'; }).join("") + '</cols>' +
    '<sheetData>' + out.join("") + '</sheetData>' +
    (n ? '<autoFilter ref="' + ref + '"/>' : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';
}

function plEstilos() {
  var f = function (cor, extra, tam) { return '<font>' + (extra || "") + '<sz val="' + (tam || 10) + '"/><color rgb="FF' + cor + '"/><name val="Arial"/><family val="2"/></font>'; };
  var fill = function (cor) { return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + cor + '"/><bgColor indexed="64"/></patternFill></fill>'; };
  var linha = '<left style="thin"><color rgb="FFE2E2DC"/></left><right style="thin"><color rgb="FFE2E2DC"/></right><top style="thin"><color rgb="FFE2E2DC"/></top><bottom style="thin"><color rgb="FFE2E2DC"/></bottom><diagonal/>';
  var xf = function (num, font, fill, borda, alin) {
    return '<xf numFmtId="' + num + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + borda + '" xfId="0"' +
      (num ? ' applyNumberFormat="1"' : '') + (font ? ' applyFont="1"' : '') + (fill ? ' applyFill="1"' : '') + (borda ? ' applyBorder="1"' : '') +
      (alin ? ' applyAlignment="1"><alignment ' + alin + '/></xf>' : '/>');
  };
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>' +
    '<fonts count="9">' + f("1A1A1A") + f("1A1A1A", "<b/>") + f("1A1A1A", "<b/>", 16) + f("6B6B66") +
      f("9B1C1C", "<b/>") + f("1E6B34", "<b/>") + f("7A5A00", "<b/>") + f("4A4A46", "<b/>") + f("1A1A1A", "<b/>", 12) + '</fonts>' +
    '<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      fill("FFCC00") + fill("F6F6F2") + fill("FDE2E1") + fill("E3F4E8") + fill("FFF4CC") + fill("ECECE8") + '</fills>' +
    '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border>' + linha + '</border>' +
      '<border><left/><right/><top/><bottom style="medium"><color rgb="FF1A1A1A"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="18">' +
      xf(0, 0, 0, 0) +                                          // 0 padrão
      xf(0, 1, 2, 1, 'horizontal="center" vertical="center" wrapText="1"') + // 1 cabeçalho amarelo
      xf(0, 0, 0, 1, 'vertical="top"') + xf(0, 0, 3, 1, 'vertical="top"') + // 2,3 texto
      xf(3, 0, 0, 1, 'vertical="top"') + xf(3, 0, 3, 1, 'vertical="top"') + // 4,5 número
      xf(164, 0, 0, 1, 'horizontal="left" vertical="top"') + xf(164, 0, 3, 1, 'horizontal="left" vertical="top"') + // 6,7 data
      xf(3, 4, 4, 1, 'vertical="top"') + xf(3, 5, 5, 1, 'vertical="top"') + xf(3, 6, 6, 1, 'vertical="top"') + xf(3, 7, 7, 1, 'vertical="top"') + // 8-11 cores
      xf(0, 2, 0, 0, 'vertical="center"') +                      // 12 título
      xf(0, 3, 0, 0) +                                          // 13 subtítulo
      xf(0, 0, 0, 1) +                                          // 14 rótulo
      xf(3, 1, 0, 1, 'horizontal="right"') +                    // 15 valor número
      xf(0, 8, 0, 2) +                                          // 16 seção
      xf(0, 1, 0, 1, 'horizontal="right"') +                    // 17 valor texto
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

// ---------- zip (sem compressão; o .xlsx aceita) ----------
var plCrcTab = null;
function plCrc32(b) {
  if (!plCrcTab) { plCrcTab = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; plCrcTab[n] = c >>> 0; } }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < b.length; i++) crc = plCrcTab[(crc ^ b[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function plZip(arquivos) {
  var enc = new TextEncoder(), partes = [], central = [], off = 0;
  var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
  var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
  var agora = new Date();
  var hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  var dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  arquivos.forEach(function (a) {
    var nome = enc.encode(a.nome), dados = enc.encode(a.conteudo), crc = plCrc32(dados);
    var cab = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(hora), u16(dia), u32(crc), u32(dados.length), u32(dados.length), u16(nome.length), u16(0));
    partes.push(new Uint8Array(cab), nome, dados);
    central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(hora), u16(dia), u32(crc), u32(dados.length), u32(dados.length),
      u16(nome.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nome);
    off += cab.length + nome.length + dados.length;
  });
  var tamCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
  var fim = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(arquivos.length), u16(arquivos.length), u32(tamCentral), u32(off), u16(0)));
  return new Blob(partes.concat(central, [fim]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function montarPlanilha(cfg) {
  var ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return plZip([
    { nome: "[Content_Types].xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { nome: "_rels/.rels", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + ns + '>' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { nome: "docProps/core.xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + plEsc(cfg.titulo) + '</dc:title><dc:creator>WMS Pilchs Info</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, "Z") + '</dcterms:created></cp:coreProperties>' },
    { nome: "xl/workbook.xml", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Resumo" sheetId="1" r:id="rId1"/><sheet name="Dados" sheetId="2" r:id="rId2"/></sheets>' +
      (cfg.linhas.length ? '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">Dados!$A$1:$' + plCol(cfg.colunas.length - 1) + '$' + (cfg.linhas.length + 1) + '</definedName></definedNames>' : '') +
      '</workbook>' },
    { nome: "xl/_rels/workbook.xml.rels", conteudo: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + ns + '>' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nome: "xl/styles.xml", conteudo: plEstilos() },
    { nome: "xl/worksheets/sheet1.xml", conteudo: plAbaResumo(cfg) },
    { nome: "xl/worksheets/sheet2.xml", conteudo: plAbaDados(cfg) }
  ]);
}

function baixarPlanilha(cfg) {
  if (!cfg || !cfg.linhas || !cfg.linhas.length) { toast("Nada pra exportar nesse período", "err"); return; }
  var blob = montarPlanilha(cfg);
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url; a.download = cfg.arquivo.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  toast("Planilha baixada ✓ Para abrir no Google Planilhas: arraste para o Drive", "ok");
}
