// sheet.js (ESM)
import { google } from 'googleapis'

let sheetsCached = null

export async function getSheetsClient() {
  if (sheetsCached) return sheetsCached
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // solo Sheets
  })
  const client = await auth.getClient()
  sheetsCached = google.sheets({ version: 'v4', auth: client })
  return sheetsCached
}

export async function appendFilas(
  spreadsheetId,
  rango,
  valores,
  valueInputOption = 'USER_ENTERED',
  insertDataOption = 'INSERT_ROWS'
) {
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: rango,
    valueInputOption,
    insertDataOption,
    requestBody: { majorDimension: 'ROWS', values: valores },
  })
  return res.data
}
