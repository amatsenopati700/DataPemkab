import { db } from './db';
import { getState, runFullIngestion, ingestOrganizations, ingestMetadata, downloadAndParse, generateMarkdown } from './engine';

const PORT = 3001;

// ── Express-like HTTP server using Bun native ─────────────
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ── GET /status ─────────────────────
      if (path === '/status' && req.method === 'GET') {
        const state = getState();
        const [totalDatasets, totalTables, totalRows, errorCount] = await Promise.all([
          db.dataset.count(),
          db.dataTable.count(),
          db.dataRow.count(),
          db.ingestionLog.count({ where: { status: 'error' } }),
        ]);

        return Response.json({
          ...state,
          stats: {
            organizations: await db.organization.count(),
            datasets: totalDatasets,
            latestDatasets: await db.dataset.count({ where: { isLatest: true } }),
            tables: totalTables,
            rows: totalRows,
            errors: errorCount,
          },
        }, { headers: corsHeaders });
      }

      // ── POST /ingest/full ───────────────
      if (path === '/ingest/full' && req.method === 'POST') {
        // Run in background
        runFullIngestion().catch(e => console.error('Ingestion error:', e));
        return Response.json({ message: 'Full ingestion started', state: getState() }, { headers: corsHeaders });
      }

      // ── POST /ingest/organizations ──────
      if (path === '/ingest/organizations' && req.method === 'POST') {
        ingestOrganizations().catch(e => console.error(e));
        return Response.json({ message: 'Organization ingestion started' }, { headers: corsHeaders });
      }

      // ── POST /ingest/metadata ───────────
      if (path === '/ingest/metadata' && req.method === 'POST') {
        ingestMetadata().catch(e => console.error(e));
        return Response.json({ message: 'Metadata ingestion started' }, { headers: corsHeaders });
      }

      // ── POST /ingest/download ───────────
      if (path === '/ingest/download' && req.method === 'POST') {
        downloadAndParse().catch(e => console.error(e));
        return Response.json({ message: 'Download & parse started' }, { headers: corsHeaders });
      }

      // ── POST /ingest/markdown ───────────
      if (path === '/ingest/markdown' && req.method === 'POST') {
        generateMarkdown().catch(e => console.error(e));
        return Response.json({ message: 'Markdown generation started' }, { headers: corsHeaders });
      }

      // ── GET /errors ─────────────────────
      if (path === '/errors' && req.method === 'GET') {
        const errors = await db.ingestionLog.findMany({
          where: { status: 'error' },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
        return Response.json(errors, { headers: corsHeaders });
      }

      // ── GET /health ─────────────────────
      if (path === '/health') {
        return Response.json({ ok: true, port: PORT }, { headers: corsHeaders });
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('Server error:', err);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
  },
});

console.log(`🚀 Ingestion service running on port ${PORT}`);