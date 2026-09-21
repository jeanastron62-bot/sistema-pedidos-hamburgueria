import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  if (!env.WHATSAPP_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      'WHATSAPP_TOKEN_ENCRYPTION_KEY não configurado neste ambiente. Necessário só pra conectar uma conta WhatsApp (Fase 15). Gere com: openssl rand -base64 32'
    );
  }
  const key = Buffer.from(env.WHATSAPP_TOKEN_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'WHATSAPP_TOKEN_ENCRYPTION_KEY precisa decodificar (base64) pra exatamente 32 bytes. Gere com: openssl rand -base64 32'
    );
  }
  return key;
}

// Formato armazenado: "iv:authTag:ciphertext", cada parte em base64.
export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':');
}

export function decryptToken(stored: string): string {
  const [ivB64, authTagB64, dataB64] = stored.split(':');
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Formato inválido de token cifrado (esperado "iv:authTag:ciphertext").');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

// Nunca logar/retornar o token inteiro (mesma regra do CONTEXTO.md pra
// credenciais: só hostname ou últimos 4 caracteres).
export function maskToken(token: string): string {
  return token.length <= 4 ? '****' : `****${token.slice(-4)}`;
}
