import express from 'express';

const app = express();

app.get('/proxy', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).send('URL obrigatória');
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const text = await response.text();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/plain');

    res.send(text);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.listen(3000, () => {
  console.log('Proxy rodando na porta 3000');
});