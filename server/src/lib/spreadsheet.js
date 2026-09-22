import Papa from "papaparse";
import * as XLSX from "xlsx";

// Lê um arquivo de planilha enviado (CSV ou Excel real — .xlsx/.xls) e devolve
// { headers, data } no mesmo formato que Papa.parse produzia antes — para que o
// resto do código (mapeamento de colunas, IA, etc.) não precise mudar nada.
//
// Antes desta função, o upload só entendia CSV de verdade: um .xlsx enviado virava
// texto binário sendo lido como se fosse texto puro, e ou dava erro, ou (pior)
// "funcionava" e gravava lixo no banco sem avisar ninguém. O campo de upload no
// frontend só deixava escolher .csv — mas mesmo destravando isso, sem essa função
// o backend quebraria do mesmo jeito.
export function parseSpreadsheet(buffer, filename) {
  const isExcel = /\.(xlsx|xls)$/i.test(filename || "");

  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return { headers: [], data: [], errors: [{ message: "Planilha Excel sem nenhuma aba." }] };
    const sheet = workbook.Sheets[firstSheetName];
    // defval: "" garante que célula vazia vira string vazia, não fica ausente do objeto —
    // mesmo comportamento do Papa.parse com skipEmptyLines para linhas, não colunas.
    const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const headers = data.length ? Object.keys(data[0]) : (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || []);
    return { headers, data, errors: [] };
  }

  const text = buffer.toString("utf-8");
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  return { headers: parsed.meta.fields || [], data: parsed.data, errors: parsed.errors };
}
