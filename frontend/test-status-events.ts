import { io } from "socket.io-client";

const TOKEN = process.argv[2];
if (!TOKEN) { console.error("Uso: npx tsx test-status-events.ts TOKEN"); process.exit(1); }

const socket = io("http://localhost:3000/staff", { auth: { token: TOKEN } });

socket.on("connect", () => console.log("Conectado ao /staff, escutando eventos de status..."));
socket.on("order:status_changed", (data) => console.log("order:status_changed:", JSON.stringify(data, null, 2)));
socket.on("order:confirmed", (data) => console.log("order:confirmed:", JSON.stringify(data, null, 2)));
socket.on("order:accepted", (data) => console.log("order:accepted:", JSON.stringify(data, null, 2)));
socket.on("order:cancelled", (data) => console.log("order:cancelled:", JSON.stringify(data, null, 2)));
console.log("Pronto. Clique em 'Começar Preparo' na tela da cozinha agora.");
