// src/routes/program.js
import { programList } from '../services/program.service.js'

export default async function formRoutes (fastify) {
  fastify.post('/programlist', async (req, reply) => {
    const data = await programList(req.body)
    return reply.code(200).send({ ok: true, data })
  })

  fastify.post('/upload/sign', async (req, reply) => {
    const { contentType, side } = await req.body // side: 'front'|'back'
    if(!contentType || !side) return reply.code(400).send({ error:'contentType y side requeridos' })
    const ext = (contentType.split('/')[1] || 'jpg').toLowerCase()

    const key = `document/${side}/${crypto.randomBytes(8).toString('hex')}.${ext}`
    const [url] = await storage
      .bucket(BUCKET)
      .file(key)
      .getSignedUrl({
        action: 'write',
        expires: Date.now() + 60 * 1000, // 60s
        contentType
      })

    // si tu bucket es público, la URL pública sería:
    const publicUrl = `https://storage.googleapis.com/${BUCKET}/${encodeURIComponent(key)}`

    // si tu bucket es privado y quieres ver “al toque”, puedes generar un GET firmado:
    /*const [viewUrl] = await storage.bucket(BUCKET).file(key).getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000 // 10 min
    })*/

    return { uploadUrl: url, key, publicUrl }
  })
}
