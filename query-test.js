const url = 'http://localhost:3000/api/rag/query';
const body = JSON.stringify({ question: '¿Cómo verifico que PostgreSQL está corriendo?' });

async function run() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log(text);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
