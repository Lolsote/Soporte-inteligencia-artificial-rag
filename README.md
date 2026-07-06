# SoporteIA — Chatbot funcional local y preparado para Docker

## Estado actual

- El chatbot responde de forma local aunque Ollama no esté disponible.
- El sistema usa una memoria simple por sesión para conservar contexto entre preguntas.
- El motor de búsqueda funciona con un vector store local en memoria, sin depender de ChromaDB para la prueba inicial.
- El backend compila y se ejecuta correctamente con Node.js.

## Requisitos locales

- Node.js 18+
- npm

## Ejecución local

```bash
cd soporteia
npm install
npm run seed
npm run dev
```

Luego abre:

- http://localhost:3000

## Endpoints importantes

- GET /api/rag/health
- POST /api/rag/query
- GET /api/rag/memory/:sessionId
- GET /api/rag/memory
- DELETE /api/rag/memory/:sessionId

## Ejemplo de consulta

```bash
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Cómo verifico que PostgreSQL está corriendo?","sessionId":"demo-session"}'
```

## Preparación para Docker

La base ya quedó preparada para que otro equipo complete el despliegue en Docker sin afectar la ejecución local.

Archivos listos para ese paso:

- Dockerfile: imagen de la API Node.js
- docker-compose.yml: servicios app, ollama y chromadb
- .env.docker.example: variables para el entorno contenedorizado

### Pasos para quien lo complete

En Windows PowerShell, basta con ejecutar:

```powershell
./scripts/docker-setup.ps1
```

En Linux/macOS:

```bash
bash ./scripts/docker-setup.sh
```

Para limpiar el entorno Docker:

```powershell
./scripts/docker-cleanup.ps1
```

```bash
bash ./scripts/docker-cleanup.sh
```

Luego, si hace falta, descargar modelos en Ollama:

```bash
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3
```

Y poblar la base de conocimiento:

```bash
docker compose exec app npm run seed
```

> La versión local sigue funcionando igual; Docker queda como una ruta de despliegue adicional para pruebas globales con Ollama.

## Puntos clave modificados

- src/rag/query.ts: incorpora memoria de sesión y contexto de conversación.
- src/rag/memory.ts: guarda el historial por sesión en disco.
- src/rag/vectorstore.ts: implementa un vector store local funcional para pruebas sin Docker.
- src/rag/llm.ts: añade fallback offline para que la IA responda aunque Ollama no esté activo.
- src/api/routes.ts: expone los endpoints de memoria.

## Verificación realizada

Se validó lo siguiente con evidencia real:

- Compilación exitosa con npm run build.
- Pruebas de memoria y vector store: 2/2 correctas.
- Endpoint del chatbot respondiendo con HTTP 200 en localhost:3000.
