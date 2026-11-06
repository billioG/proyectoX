// Cifrado de contraseñas de alumnos para poder MOSTRARLAS o IMPRIMIRLAS sin guardarlas legibles (docs/SEGURIDAD_2026-11.md).
//
// AES-256-GCM con Web Crypto (el mismo código corre en Deno y en Node 22, así que se prueba con Node).
//   * La llave (32 bytes en base64) vive SOLO en el secreto PASSWORD_VAULT_KEY de las Edge Functions; nunca en la base ni en el navegador.
//   * Cada cifrado lleva su propio IV aleatorio de 12 bytes.
//   * `aad` (datos autenticados) = el id del alumno: un texto cifrado copiado a la fila de OTRO alumno no se descifra (GCM lo rechaza).
//   * Formato: "v1.<iv base64url>.<texto cifrado+etiqueta base64url>". El prefijo permite cambiar de algoritmo o de llave después.
//
// Generar una llave:  openssl rand -base64 32      (o:  node -e "console.log(crypto.randomBytes(32).toString('base64'))")
// Sin dependencias externas.

const VERSION = 'v1';
const enc = new TextEncoder();
const dec = new TextDecoder();

export class VaultError extends Error {
  constructor(message: string) { super(message); this.name = 'VaultError'; }
}

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** La llave en base64 (o base64url) de EXACTAMENTE 32 bytes. Cualquier otra cosa es un error de configuración, no se rellena ni se recorta. */
export async function importKey(keyB64: string | undefined | null): Promise<CryptoKey> {
  if (!keyB64 || !String(keyB64).trim()) throw new VaultError('Falta el secreto PASSWORD_VAULT_KEY');
  let raw: Uint8Array;
  try { raw = fromB64Url(String(keyB64).trim()); } catch { throw new VaultError('PASSWORD_VAULT_KEY no es base64 válido'); }
  if (raw.length !== 32) throw new VaultError(`PASSWORD_VAULT_KEY debe ser de 32 bytes (es de ${raw.length}); genera una con: openssl rand -base64 32`);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptPassword(plain: string, key: CryptoKey, aad: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) throw new VaultError('Contraseña vacía');
  if (!aad) throw new VaultError('Falta el id del alumno para atar el cifrado');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(plain)));
  return `${VERSION}.${toB64Url(iv)}.${toB64Url(ct)}`;
}

/** Descifra. Lanza VaultError si el formato, la llave o el id del alumno no coinciden (nunca devuelve basura). */
export async function decryptPassword(blob: string, key: CryptoKey, aad: string): Promise<string> {
  const parts = String(blob ?? '').split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) throw new VaultError('Formato de contraseña cifrada no reconocido');
  let iv: Uint8Array, ct: Uint8Array;
  try { iv = fromB64Url(parts[1]); ct = fromB64Url(parts[2]); } catch { throw new VaultError('Contraseña cifrada dañada'); }
  if (iv.length !== 12 || ct.length < 17) throw new VaultError('Contraseña cifrada dañada');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, ct);
    return dec.decode(pt);
  } catch {
    throw new VaultError('No se pudo descifrar (llave distinta o contraseña de otro alumno)');
  }
}
