// src/app.js  (ESM)
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import 'dotenv/config'
import { Storage } from '@google-cloud/storage'
import crypto from 'crypto'
import { google } from 'googleapis'

/* =========================
 * Fastify + CORS/Helmet
 * ========================= */
const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })

await app.register(helmet)
await app.register(cors, {
  origin: (origin, cb) => {
    const allowed = (process.env.ALLOWED_ORIGINS || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    if (!origin || allowed.includes(origin)) return cb(null, true)
    cb(new Error('Origen no permitido'), false)
  },
  methods: ['GET','POST','PUT','OPTIONS'],
  allowedHeaders: ['Content-Type']
})

/* =========================
 * Entorno
 * ========================= */
const {
  GCP_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS,
  GCS_BUCKET,
  GOOGLE_SHEET_ID,
  PORT = 3000,
  PUBLIC_BASE_URL = 'http://localhost:3000'
} = process.env

app.log.info({ GCP_PROJECT_ID, GCS_BUCKET, GOOGLE_SHEET_ID, CRED_PATH: GOOGLE_APPLICATION_CREDENTIALS })
if (!GCP_PROJECT_ID || !GOOGLE_APPLICATION_CREDENTIALS || !GCS_BUCKET || !GOOGLE_SHEET_ID) {
  app.log.error('❌ Faltan variables de entorno obligatorias.')
  process.exit(1)
}

/* =========================
 * Clientes: GCS + Sheets
 * ========================= */
const storage = new Storage({ projectId: GCP_PROJECT_ID, keyFilename: GOOGLE_APPLICATION_CREDENTIALS })

let sheetsCached = null
async function getSheetsClient () {
  if (sheetsCached) return sheetsCached
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ]
  })
  const client = await auth.getClient()
  sheetsCached = google.sheets({ version: 'v4', auth: client })
  return sheetsCached
}

// Próxima fila libre (respeta cabeceras en fila 1)
async function getNextRow(sheets, spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`
  })
  const rows = res.data.values?.length || 0
  return Math.max(2, rows + 1)
}

// util: null/undefined → ''
const safe = (v) => (v === null || v === undefined ? '' : v)

/* =========================
 * Upload firmado (WRITE)
 * ========================= */
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','image/heic'])

app.post('/upload/sign', async (req, reply) => {
  try {
    const { contentType, side } = req.body || {}
    if (!contentType || !side) return reply.code(400).send({ error: 'contentType y side requeridos' })
    if (!ALLOWED_MIME.has(contentType)) return reply.code(400).send({ error: 'Tipo no permitido' })
    if (!['front','back'].includes(side)) return reply.code(400).send({ error: 'side inválido' })

    const extMap = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/heic':'heic' }
    const ext = extMap[contentType] || 'bin'
    const key = `dni/${side}/${crypto.randomBytes(8).toString('hex')}.${ext}`

    const [uploadUrl] = await storage.bucket(GCS_BUCKET).file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 5 * 60 * 1000, // 5 min
      contentType,
      extensionHeaders: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-goog-meta-side': side
      }
    })

    // bucket privado → devolvemos key (y, si quieres, también una URL pública si fuese público)
    return { uploadUrl, key }
  } catch (err) {
    req.log.error(err)
    return reply.code(500).send({ error: 'No se pudo generar URL firmada' })
  }
})

/* =========================
 * Leer firmado (READ) con redirect
 * ========================= */
app.get('/file/view', async (req, reply) => {
  const { key } = req.query || {}
  if (!key) return reply.code(400).send('key requerido')
  try {
    const [signed] = await storage.bucket(GCS_BUCKET).file(String(key)).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000
    })
    return reply.redirect(signed)
  } catch (err) {
    req.log.error(err)
    return reply.code(404).send('Archivo no encontrado o sin permiso')
  }
})

app.get('/api/health', async () => ({ ok: true }))

/* =========================
 * Inscripción → Sheets (UPDATE en próxima fila)
 * ========================= */
app.post('/inscripcion', async (req, reply) => {
  try {
    const body = req.body || {}
    const archivos = body.archivos || {}
    const sheets = await getSheetsClient()

    const SHEET_NAME = 'Inscripciones'
    const spreadsheetId = GOOGLE_SHEET_ID
    const next = await getNextRow(sheets, spreadsheetId, SHEET_NAME)
    console.log(next)
    const range = `${SHEET_NAME}!A${next}:AE${next}`
    console.log(range)
    const timestamp = new Date().toISOString()

    // si guardas solo keys (bucket privado), armamos links clicables con /file/view
    const frontKey = safe(archivos.dni_front_key)
    const backKey  = safe(archivos.dni_back_key)
    const frontHref = frontKey ? `${PUBLIC_BASE_URL}/file/view?key=${encodeURIComponent(frontKey)}` : ''
    const backHref  = backKey  ? `${PUBLIC_BASE_URL}/file/view?key=${encodeURIComponent(backKey)}` : ''
    const H = (url, text) => (url ? `=HYPERLINK("${url}";"${text}")` : '')

    // fila (31 columnas → A..AE)
    const row = [
      safe(body.email),
      safe(body.documento),
      safe(body.born),
      safe(body.apellidos),
      safe(body.nombres),
      safe(body.celular),
      safe(body.categoriaPrograma),
      safe(body.programa),
      safe(body.carrera),
      safe(body.carreraOtra),
      safe(body.universidad),
      safe(body.universidadOtra),
      safe(body.gradoAcademico),
      safe(body.situacionActual),
      safe(body.areaActual),
      safe(body.areaDeseada),
      safe(body.empresa),
      safe(body.puesto),
      safe(body.aniosExp),
      safe(body.sector),
      safe(body.programaEmprendimiento),
      safe(body.tallerSpeaking),
      safe(body.pais),
      safe(body.departamento),
      safe(body.necesidadEspecial),
      safe(body.necesidadEspecialOtra),
      H(frontHref, 'Ver DNI frontal'),
      H(backHref,  'Ver DNI reverso'),
      frontKey,
      backKey,
      timestamp
    ]

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { majorDimension: 'ROWS', values: [row] }
    })

    return reply.code(200).send({ ok: true, message: 'Datos guardados correctamente en Google Sheets' })
  } catch (err) {
    req.log.error({ reqId: req.id, message: err?.message, code: err?.code, stack: err?.stack })
    return reply.code(500).send({ ok: false, error: 'Error al guardar los datos' })
  }
})

/* =========================
 * Server
 * ========================= */
app.listen({ port: Number(PORT), host: '0.0.0.0' }).then(addr => {
  app.log.info(`Server listening at ${addr}`)
})
