import express from 'express';

const app = express();

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