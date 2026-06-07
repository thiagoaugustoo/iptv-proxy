import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const app = express();

const PORT = process.env.PORT || 3000;
const HLS_DIR = './hls';

if (!fs.existsSync(HLS_DIR)) {
  fs.mkdirSync(HLS_DIR, { recursive: true });
}

const activeStreams = new Map();

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

/*
|--------------------------------------------------------------------------
| M3U Proxy
|--------------------------------------------------------------------------
*/
app.get('/proxy', async (req, res) => {
  try {
    const sourceUrl = req.query.url;

    if (!sourceUrl) {
      return res.status(400).send('URL obrigatória');
    }

    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
      }
    });

    const text = await response.text();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    res.status(response.status).send(text);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

/*
|--------------------------------------------------------------------------
| HLS Static Files
|--------------------------------------------------------------------------
*/
app.use('/hls', express.static(path.resolve(HLS_DIR)));

/*
|--------------------------------------------------------------------------
| TS -> HLS
|--------------------------------------------------------------------------
*/
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

      console.log('Iniciando stream:', streamId);

      const ffmpeg = spawn('ffmpeg', [

        '-re',

        '-user_agent',
        'Mozilla/5.0',

        '-i',
        sourceUrl,

        '-map',
        '0',

        '-c:v',
        'copy',

        '-c:a',
        'aac',

        '-b:a',
        '128k',

        '-ac',
        '2',

        '-f',
        'hls',

        '-hls_time',
        '2',

        '-hls_list_size',
        '10',

        '-hls_flags',
        'delete_segments+append_list+independent_segments',

        '-hls_segment_filename',
        path.join(outputDir, 'segment_%03d.ts'),

        playlistPath

      ]);

      ffmpeg.stderr.on('data', data => {
        console.log(data.toString());
      });

      ffmpeg.on('close', code => {
        console.log('FFmpeg encerrado:', code);
        activeStreams.delete(streamId);
      });

      ffmpeg.on('error', err => {
        console.error(err);
        activeStreams.delete(streamId);
      });

      activeStreams.set(streamId, ffmpeg);
    }

    // aguarda playlist ser criada
    let attempts = 0;

    while (!fs.existsSync(playlistPath) && attempts < 20) {

      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );

      attempts++;
    }

    if (!fs.existsSync(playlistPath)) {

      return res.status(500).json({
        error: 'FFmpeg não conseguiu gerar playlist'
      });

    }

    return res.json({

      hls:
        `https://proxy.silvatech.dev.br/hls/${streamId}/index.m3u8`

    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: err.message
    });

  }
});

/*
|--------------------------------------------------------------------------
| Cleanup automático
|--------------------------------------------------------------------------
*/
setInterval(() => {

  const now = Date.now();

  for (const [streamId, process] of activeStreams.entries()) {

    const folder = path.join(HLS_DIR, streamId);

    if (!fs.existsSync(folder)) continue;

    const stat = fs.statSync(folder);

    const ageMinutes =
      (now - stat.mtimeMs) / 1000 / 60;

    if (ageMinutes > 30) {

      console.log('Removendo stream inativo:', streamId);

      process.kill('SIGKILL');

      activeStreams.delete(streamId);

      fs.rmSync(folder, {
        recursive: true,
        force: true
      });
    }
  }

}, 300000);

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/
app.listen(PORT, () => {
  console.log(`Proxy rodando na porta ${PORT}`);
});