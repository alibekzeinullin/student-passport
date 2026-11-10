import { createHmac } from "node:crypto";
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b({alg:"HS256",typ:"JWT"}); const body = b(p); return h+"."+body+"."+createHmac("sha256","super-secret-jwt-token-with-at-least-32-characters-long").update(h+"."+body).digest("base64url"); };
const exp = Math.floor(Date.now()/1000) + 10*365*86400;
console.log("ANON=" + sign({role:"anon", iss:"supabase", exp}));
console.log("SERVICE=" + sign({role:"service_role", iss:"supabase", exp}));
