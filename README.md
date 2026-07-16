Este codigo se trata de una pagina que usa un soporte de ia para dar una solucion a un problema informatico de hackeo, rag, etc.

  Explicacion rapida:

- El codigo posee 2 inteligencias artificiales funcionales, para que pueda ser usado de manera local o ya renderizado.
- El chatbot local se maneja mediante docker y se usa ollama.ia si no funciona, entonces pasara al otro que este disponible.
- El chatbot online se maneja mediante la api gratuita de gemini, no es tan rapida como la de ollama y tiene un limite de preguntas, si esta no funciona, pasara a la otra disponible.
- En el caso de que el chatbot no responda, se usara un intento de ia de forma local, esta ia es demasiado ineficaz pero en teoria el usuario comun casi nunca tendria que verla en funcionamiento.
- El sistema usa una memoria simple por sesión para conservar contexto entre preguntas.
- El motor de búsqueda funciona con un vector store local en memoria, sin depender de ChromaDB para la prueba inicial.
- El backend compila y se ejecuta correctamente con Node.js.
- El usuario admin podra ver las cuentas conectadas y las preguntas generadas por la ia para sus respectivos mantenimiento
- El prompt dentro de la inteligencia artificial esta obligada para temas de informatica, no dara ningun tipo de informacion de otros temas

  Requisitos para operar el codigo:

- Node.js 
- npm

Requisitos para operar de manera local:


cd soporteia
npm install
npm run seed
npm run dev


ruta de la pagina de manera local:

- http://localhost:3000

Es neceario descargar estos modelos en Ollama para el funcionamiento local:


docker compose exec ollama ollama pull nomic-embed-text
docker compose exec ollama ollama pull llama3



