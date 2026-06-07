import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const app = express();
  const HLS_DIR = './hls';

    if (!fs.existsSync(HLS_DIR)) {
      fs.mkdirSync(HLS_DIR, { recursive: true });
  }

app.get('/proxy', async (req, res) => {
  try {
    // 1. Pegamos a URL bruta da requisição (ex: /proxy?url=http...)
    const rawUrl = req.url; 
    
    // 2. Extraímos exatamente tudo o que está após o "?url="
    const urlIndex = rawUrl.indexOf('?url=');
    
    if (urlIndex === -1) {
      return res.status(400).send('URL obrigatória');
    }
    
    // Decodifica a URL para garantir que os caracteres especiais funcionem no fetch
    const targetUrl = decodeURIComponent(rawUrl.substring(urlIndex + 5));

    // 3. Fazemos o fetch com a URL 100% íntegra e um User-Agent robusto
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const text = await response.text();

    // Configura os headers de resposta
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Dica: listas m3u geralmente usam o content-type 'application/x-mpegurl' ou 'text/plain'
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    res.status(response.status).send(text);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.listen(3000, () => {
  console.log('Proxy rodando na porta 3000');
});

app.use('/hls', express.static(HLS_DIR));

const activeStreams = new Map();

app.get('/stream', async (req, res) => {
  try {
    const sourceUrl = req.query.url;

    if (!sourceUrl) {
      return res.status(400).json({
        error: 'URL obrigatória'
      });
    }

    const streamId = Buffer
      .from(sourceUrl)
      .toString('base64')
      .replace(/[^a-zA-Z0-9]/g, '');

    const outputDir = path.join(HLS_DIR, streamId);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const playlistPath = path.join(outputDir, 'index.m3u8');

    if (!activeStreams.has(streamId)) {

      console.log('Iniciando FFmpeg:', streamId);

      const ffmpeg = spawn('ffmpeg', [
        '-i', sourceUrl,

        '-c:v', 'copy',
        '-c:a', 'aac',

        '-f', 'hls',

        '-hls_time', '4',
        '-hls_list_size', '6',

        '-hls_flags',
        'delete_segments+append_list',

        playlistPath
      ]);

      ffmpeg.stderr.on('data', data => {
        console.log(data.toString());
      });

      ffmpeg.on('close', code => {
        console.log('FFmpeg encerrado:', code);
        activeStreams.delete(streamId);
      });

      activeStreams.set(streamId, ffmpeg);
    }

    res.json({
      hls: `https://proxy.silvatech.dev.br/hls/${streamId}/index.m3u8`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});