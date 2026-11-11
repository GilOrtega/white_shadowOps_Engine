/** Genera las llaves VAPID para los avisos push. Corre una vez: npm run push:keys */
import webpush from "web-push";

const k = webpush.generateVAPIDKeys();
console.log("Pega esto en Vercel → Settings → Environment Variables (y en .env.local):\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log("VAPID_SUBJECT=mailto:tu-correo@ejemplo.com");
console.log("CRON_SECRET=<una cadena larga al azar>");
